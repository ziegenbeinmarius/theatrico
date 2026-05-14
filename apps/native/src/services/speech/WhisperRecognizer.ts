import type { ISpeechRecognizer, RecognitionResult, RecognizeOptions } from './ISpeechRecognizer';

type ExpoConstantsModule = {
  default?: {
    executionEnvironment?: string;
    appOwnership?: string;
  };
};

export interface WhisperModelOptions {
  modelUrl?: string;
  modelPath?: string;
  vadModelUrl?: string;
  vadModelPath?: string;
  onProgress?: (progress: number) => void;
}

type WhisperModule = {
  initWhisper: (options: {
    filePath: string;
    useGpu?: boolean;
    useFlashAttn?: boolean;
    useCoreMLIos?: boolean;
  }) => Promise<WhisperContext>;
  initWhisperVad?: (options: {
    filePath: string;
    useGpu?: boolean;
    nThreads?: number;
  }) => Promise<WhisperVadContext>;
};

type TranscribeOptions = {
  language: string;
  translate: boolean;
  temperature: number;
  temperatureInc: number;
  beamSize: number;
  maxContext: number;
  maxLen: number;
  prompt?: string;
};

type TranscribeResult = {
  result?: string;
  isAborted?: boolean;
};

type WhisperContext = {
  transcribeData: (
    data: ArrayBuffer,
    options: TranscribeOptions,
  ) => {
    stop: () => Promise<void>;
    promise: Promise<TranscribeResult>;
  };
};

type WhisperVadContext = {
  detectSpeechData: (
    data: ArrayBuffer,
    options: {
      threshold?: number;
      minSpeechDurationMs?: number;
      minSilenceDurationMs?: number;
      maxSpeechDurationS?: number;
      speechPadMs?: number;
      samplesOverlap?: number;
    },
  ) => Promise<{ t0: number; t1: number }[]>;
};

type AudioStreamData = {
  data: Uint8Array;
  sampleRate: number;
  channels: number;
  timestamp: number;
};

type AudioStreamAdapter = {
  initialize: (config: {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
    audioSource: number;
    bufferSize: number;
  }) => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  release: () => Promise<void>;
  onData: (callback: (data: AudioStreamData) => void) => void;
  onError: (callback: (error: string) => void) => void;
  onStatusChange: (callback: (isRecording: boolean) => void) => void;
};

type AudioPcmStreamAdapterModule = {
  AudioPcmStreamAdapter: new () => AudioStreamAdapter;
};

const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2;
const STREAM_CHUNK_TARGET_MS = 3600;
const STREAM_CHUNK_MIN_MS = 1400;
const STREAM_SILENCE_FLUSH_MS = 700;
const STREAM_MAX_QUEUE = 8;

export class WhisperRecognizer implements ISpeechRecognizer {
  readonly type = 'whisper' as const;

  private resultListeners: Set<(r: RecognitionResult) => void> = new Set();
  private errorListeners: Set<(e: Error) => void> = new Set();
  private whisperCtx: WhisperContext | null = null;
  private whisperVadCtx: WhisperVadContext | null = null;
  private audioStream: AudioStreamAdapter | null = null;
  private audioBuffers: Uint8Array[] = [];
  private audioBytes = 0;
  private chunkHasSpeech = false;
  private lastSpeechAt = 0;
  private pendingAudio: Uint8Array[] = [];
  private queuePromise: Promise<void> | null = null;
  private activeTranscriptionStop: (() => Promise<void>) | null = null;
  private activeOptions: { language: string; prompt?: string } = { language: 'en' };
  private isRunning = false;
  private readonly modelOptions: WhisperModelOptions;

  constructor(modelOptions: WhisperModelOptions = {}) {
    this.modelOptions = modelOptions;
  }

  onResult(cb: (result: RecognitionResult) => void): () => void {
    this.resultListeners.add(cb);
    return () => this.resultListeners.delete(cb);
  }

  onError(cb: (err: Error) => void): () => void {
    this.errorListeners.add(cb);
    return () => this.errorListeners.delete(cb);
  }

  async start(options: RecognizeOptions): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      await this.ensureModel();

      const { AudioPcmStreamAdapter } = this.requireAudioPcmStreamAdapter();
      const audioStream = new AudioPcmStreamAdapter();
      this.audioStream = audioStream;
      this.activeOptions = {
        language: this.normalizeLanguage(options.language),
        prompt: this.trimPrompt(options.contextHint),
      };
      this.resetAudioState();

      await this.ensureVadContext().catch(() => null);

      audioStream.onData((data) => this.handleAudioData(data.data));
      audioStream.onError((error) => this.emitError(new Error(error)));
      audioStream.onStatusChange(() => undefined);
      await audioStream.initialize({
        sampleRate: SAMPLE_RATE,
        channels: 1,
        bitsPerSample: 16,
        audioSource: 6,
        bufferSize: 8192,
      });
      await audioStream.start();
    } catch (err) {
      this.isRunning = false;
      this.emitError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    const audioStream = this.audioStream;
    await audioStream?.stop().catch(() => {});
    this.flushCurrentAudio(true);
    await this.drainQueuedAudio();
    this.isRunning = false;
    await audioStream?.release().catch(() => {});
    this.audioStream = null;

    if (this.activeTranscriptionStop) {
      await this.activeTranscriptionStop().catch(() => {});
      this.activeTranscriptionStop = null;
    }
    this.resetAudioState();
  }

  private async ensureModel(): Promise<void> {
    if (this.whisperCtx) return;

    let filePath = this.modelOptions.modelPath;

    if (!filePath && this.modelOptions.modelUrl) {
      filePath = await this.downloadModel(this.modelOptions.modelUrl, this.modelOptions.onProgress);
    }

    if (!filePath) {
      throw new Error('WhisperRecognizer: no model path or URL provided');
    }

    const { initWhisper } = this.requireWhisper();
    this.whisperCtx = await initWhisper({
      filePath,
      useGpu: true,
      useFlashAttn: true,
    });
  }

  private async ensureVadContext(): Promise<WhisperVadContext | null> {
    if (this.whisperVadCtx) return this.whisperVadCtx;

    let filePath = this.modelOptions.vadModelPath;

    if (!filePath && this.modelOptions.vadModelUrl) {
      filePath = await this.downloadModel(this.modelOptions.vadModelUrl);
    }

    if (!filePath) {
      return null;
    }

    const { initWhisperVad } = this.requireWhisper();
    if (typeof initWhisperVad !== 'function') {
      return null;
    }

    this.whisperVadCtx = await initWhisperVad({
      filePath,
      useGpu: true,
    });
    return this.whisperVadCtx;
  }

  private handleAudioData(audioData: Uint8Array): void {
    if (!this.isRunning || audioData.length === 0) return;

    const now = Date.now();
    this.audioBuffers.push(audioData);
    this.audioBytes += audioData.length;

    const frameStats = this.getPcm16Stats(audioData);
    if (frameStats.rms >= 0.004 || frameStats.peak >= 0.04) {
      this.chunkHasSpeech = true;
      this.lastSpeechAt = now;
    }

    const durationMs = this.currentAudioDurationMs();
    const silenceMs = this.lastSpeechAt > 0 ? now - this.lastSpeechAt : 0;
    const shouldFlush =
      durationMs >= STREAM_CHUNK_TARGET_MS ||
      (this.chunkHasSpeech &&
        durationMs >= STREAM_CHUNK_MIN_MS &&
        silenceMs >= STREAM_SILENCE_FLUSH_MS);

    if (shouldFlush) {
      this.flushCurrentAudio(false);
    }
  }

  private flushCurrentAudio(force: boolean): void {
    if (this.audioBytes === 0) return;

    const durationMs = this.currentAudioDurationMs();
    if (!force && durationMs < STREAM_CHUNK_MIN_MS) return;

    const audioData = this.combineAudioBuffers();
    const hadSpeech = this.chunkHasSpeech;
    this.resetCurrentAudioBuffer();

    if (!force && !hadSpeech && !this.shouldTranscribeAudio(audioData, durationMs)) {
      return;
    }

    if (this.pendingAudio.length >= STREAM_MAX_QUEUE) {
      const last = this.pendingAudio.pop();
      if (last) {
        this.pendingAudio.push(this.combineBuffers(last, audioData));
      }
    } else {
      this.pendingAudio.push(audioData);
    }

    void this.processQueuedAudio();
  }

  private processQueuedAudio(): Promise<void> {
    if (this.queuePromise) return this.queuePromise;

    this.queuePromise = (async () => {
      try {
        while (this.pendingAudio.length > 0 && this.isRunning) {
          const audioData = this.pendingAudio.shift();
          if (!audioData) continue;
          await this.transcribeAudioChunk(audioData);
        }
      } finally {
        this.queuePromise = null;
      }
    })();

    return this.queuePromise;
  }

  private async drainQueuedAudio(): Promise<void> {
    while (this.isRunning && (this.pendingAudio.length > 0 || this.queuePromise)) {
      await this.processQueuedAudio();
    }
  }

  private async transcribeAudioChunk(audioData: Uint8Array): Promise<void> {
    const durationMs = this.audioDurationMs(audioData.length);
    if (!this.shouldTranscribeAudio(audioData, durationMs)) return;

    const hasSpeech = await this.hasVadSpeech(audioData);
    if (!hasSpeech && !this.isLoudSpeechLikeAudio(audioData)) return;

    const whisperCtx = this.whisperCtx;
    if (!whisperCtx) return;

    const audioBuffer = this.toArrayBuffer(audioData);
    const { stop, promise } = whisperCtx.transcribeData(audioBuffer, {
      language: this.activeOptions.language,
      translate: false,
      temperature: 0,
      temperatureInc: 0,
      beamSize: 3,
      maxContext: 224,
      maxLen: 180,
      ...(this.activeOptions.prompt ? { prompt: this.activeOptions.prompt } : {}),
    });

    this.activeTranscriptionStop = stop;
    try {
      const result = await promise;
      if (result.isAborted) return;
      const text = this.sanitizeTranscript(result.result ?? '');
      if (text && !this.isMetaTranscript(text)) {
        this.emitResult({ text, isFinal: true });
      }
    } catch (error) {
      this.emitError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      if (this.activeTranscriptionStop === stop) {
        this.activeTranscriptionStop = null;
      }
    }
  }

  private async hasVadSpeech(audioData: Uint8Array): Promise<boolean> {
    if (!this.whisperVadCtx) return true;

    try {
      const segments = await this.whisperVadCtx.detectSpeechData(this.toArrayBuffer(audioData), {
        threshold: 0.32,
        minSpeechDurationMs: 140,
        minSilenceDurationMs: 360,
        maxSpeechDurationS: 8,
        speechPadMs: 120,
        samplesOverlap: 0.25,
      });
      return segments.length > 0;
    } catch {
      return true;
    }
  }

  private currentAudioDurationMs(): number {
    return this.audioDurationMs(this.audioBytes);
  }

  private audioDurationMs(byteLength: number): number {
    return (byteLength / (SAMPLE_RATE * BYTES_PER_SAMPLE)) * 1000;
  }

  private combineAudioBuffers(): Uint8Array {
    const combined = new Uint8Array(this.audioBytes);
    let offset = 0;
    for (const buffer of this.audioBuffers) {
      combined.set(buffer, offset);
      offset += buffer.length;
    }
    return combined;
  }

  private combineBuffers(a: Uint8Array, b: Uint8Array): Uint8Array {
    const combined = new Uint8Array(a.length + b.length);
    combined.set(a, 0);
    combined.set(b, a.length);
    return combined;
  }

  private resetAudioState(): void {
    this.pendingAudio = [];
    this.resetCurrentAudioBuffer();
  }

  private resetCurrentAudioBuffer(): void {
    this.audioBuffers = [];
    this.audioBytes = 0;
    this.chunkHasSpeech = false;
    this.lastSpeechAt = 0;
  }

  private toArrayBuffer(audioData: Uint8Array): ArrayBuffer {
    if (audioData.byteOffset === 0 && audioData.byteLength === audioData.buffer.byteLength) {
      return audioData.buffer as ArrayBuffer;
    }
    return audioData.buffer.slice(
      audioData.byteOffset,
      audioData.byteOffset + audioData.byteLength,
    ) as ArrayBuffer;
  }

  private async downloadModel(url: string, onProgress?: (p: number) => void): Promise<string> {
    const FileSystem = this.requireFileSystem();
    const fileName = url.split('/').pop() ?? 'whisper-model.bin';
    const dest = `${FileSystem.cacheDirectory}${fileName}`;

    const info = await FileSystem.getInfoAsync(dest);
    if (info.exists) return dest;

    const task = FileSystem.createDownloadResumable(url, dest, {}, (progress) => {
      if (onProgress && progress.totalBytesExpectedToWrite > 0) {
        onProgress(progress.totalBytesWritten / progress.totalBytesExpectedToWrite);
      }
    });

    await task.downloadAsync();
    return dest;
  }

  private emitResult(result: RecognitionResult): void {
    this.resultListeners.forEach((cb) => cb(result));
  }

  private emitError(err: Error): void {
    this.errorListeners.forEach((cb) => cb(err));
  }

  private normalizeLanguage(language?: string): string {
    const normalized = language?.trim().toLowerCase();
    if (!normalized) return 'en';
    return normalized.split(/[-_]/)[0] || 'en';
  }

  private trimPrompt(prompt?: string): string | undefined {
    const normalized = prompt
      ?.replace(/\s+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!normalized) return undefined;
    return normalized.length > 1800 ? normalized.slice(-1800) : normalized;
  }

  private sanitizeTranscript(text: string): string {
    return text
      .replace(/[\u0000-\u001f\u007f\ufffd]/g, ' ')
      .replace(
        /\[\s*(silence|silent|noise|music|applause|laughter|inaudible|blank|end of audio|end audio)\s*\]/gi,
        ' ',
      )
      .replace(/nearby theater dialogue,?\s+in script order:?\s*/gi, ' ')
      .replace(/^[\s♪♫♬♩•·….,;:!?()[\]{}*_#|<>/\\-]+/u, '')
      .replace(/^[^\s]*[^\x00-\x7F][^\s]*/u, '') // strip chunk-boundary garbage token containing non-ASCII
      .replace(/\s+/g, ' ')
      .trim();
  }

  private shouldTranscribeAudio(
    audioData: Uint8Array,
    durationMs: number,
    vadConfidence?: number,
  ): boolean {
    if (durationMs < 1200) return false;

    const { rms, peak } = this.getPcm16Stats(audioData);
    if (rms < 0.002 && peak < 0.025) return false;
    if (vadConfidence !== undefined && vadConfidence < 0.08 && rms < 0.006) return false;

    return true;
  }

  private isLoudSpeechLikeAudio(audioData: Uint8Array): boolean {
    const { rms, peak } = this.getPcm16Stats(audioData);
    return rms >= 0.01 || peak >= 0.12;
  }

  private getPcm16Stats(audioData: Uint8Array): { rms: number; peak: number } {
    let sumSquares = 0;
    let peak = 0;
    let samples = 0;

    for (let i = 0; i + 1 < audioData.length; i += 2) {
      const lo = audioData[i] ?? 0;
      const hi = audioData[i + 1] ?? 0;
      const raw = lo | (hi << 8);
      const signed = raw >= 0x8000 ? raw - 0x10000 : raw;
      const normalized = signed / 32768;
      const abs = Math.abs(normalized);
      sumSquares += normalized * normalized;
      if (abs > peak) peak = abs;
      samples += 1;
    }

    return {
      rms: samples > 0 ? Math.sqrt(sumSquares / samples) : 0,
      peak,
    };
  }

  private isMetaTranscript(text: string): boolean {
    const normalized = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N} ]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!normalized) return true;

    const metaPhrases = new Set([
      'end of audio',
      'end audio',
      'silence',
      'silent',
      'noise',
      'music',
      'applause',
      'laughter',
      'blank',
      'inaudible',
      'thank you for watching',
      'thanks for watching',
      'subtitles by',
      'captioned by',
      'probabilistic', // known Whisper hallucination word
    ]);

    if (metaPhrases.has(normalized)) return true;

    const lexicalChars = text.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
    if (lexicalChars < 2) return true;

    return false;
  }

  private requireWhisper(): WhisperModule {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('whisper.rn') as Partial<WhisperModule>;
      if (typeof mod?.initWhisper !== 'function') {
        throw new Error(this.getWhisperUnavailableMessage());
      }
      return mod as WhisperModule;
    } catch (error) {
      if (error instanceof Error) {
        const msg = error.message ?? '';
        if (
          msg.includes('getConstants') ||
          msg.includes('NativeModule') ||
          msg.includes('Cannot find module')
        ) {
          throw new Error(this.getWhisperUnavailableMessage());
        }
      }
      throw error;
    }
  }

  private requireAudioPcmStreamAdapter(): AudioPcmStreamAdapterModule {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('whisper.rn/src/realtime-transcription/adapters/AudioPcmStreamAdapter') as AudioPcmStreamAdapterModule;
  }

  private getWhisperUnavailableMessage(): string {
    if (this.isRunningInExpoGo()) {
      return 'Whisper is unavailable in Expo Go. Use a development build.';
    }
    return 'Whisper native module is not available. Rebuild/reinstall the app so native modules are linked.';
  }

  private isRunningInExpoGo(): boolean {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const constants = require('expo-constants') as ExpoConstantsModule;
      const env = constants?.default?.executionEnvironment;
      const ownership = constants?.default?.appOwnership;
      return env === 'storeClient' || ownership === 'expo';
    } catch {
      return false;
    }
  }

  private requireFileSystem(): {
    cacheDirectory: string;
    getInfoAsync: (p: string) => Promise<{ exists: boolean }>;
    createDownloadResumable: (
      url: string,
      dest: string,
      opts: object,
      cb: (p: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void,
    ) => { downloadAsync: () => Promise<unknown> };
  } {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-file-system/legacy') as ReturnType<typeof this.requireFileSystem>;
  }
}
