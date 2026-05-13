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
  onProgress?: (progress: number) => void;
}

type WhisperModule = {
  initWhisper: (options: {
    filePath: string;
    useGpu?: boolean;
    useFlashAttn?: boolean;
    useCoreMLIos?: boolean;
  }) => Promise<unknown>;
};

type RealtimeTranscriberModule = {
  RealtimeTranscriber: new (
    deps: { whisperContext: unknown; audioStream: unknown },
    options?: object,
    callbacks?: {
      onTranscribe?: (event: { type: string; data?: { result?: string }; isCapturing: boolean }) => void;
      onError?: (error: string) => void;
    },
  ) => {
    start: () => Promise<void>;
    stop: () => Promise<void>;
    release: () => Promise<void>;
  };
};

type AudioPcmStreamAdapterModule = {
  AudioPcmStreamAdapter: new () => unknown;
};

export class WhisperRecognizer implements ISpeechRecognizer {
  readonly type = 'whisper' as const;

  private resultListeners: Set<(r: RecognitionResult) => void> = new Set();
  private errorListeners: Set<(e: Error) => void> = new Set();
  private whisperCtx: unknown = null;
  private transcriber: { start: () => Promise<void>; stop: () => Promise<void>; release: () => Promise<void> } | null = null;
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

      const { RealtimeTranscriber } = this.requireRealtimeTranscriber();
      const { AudioPcmStreamAdapter } = this.requireAudioPcmStreamAdapter();

      const audioStream = new AudioPcmStreamAdapter();

      this.transcriber = new RealtimeTranscriber(
        { whisperContext: this.whisperCtx, audioStream },
        {
          audioSliceSec: 2,
          audioMinSec: 1,
          initialPrompt: options.contextHint,
          transcribeOptions: {
            language: options.language,
            temperature: 0,
            beamSize: 1,
            bestOf: 1,
            maxLen: 80,
          },
          vadOptions: {
            threshold: 0.6,
            minSpeechDurationMs: 200,
            minSilenceDurationMs: 500,
          },
          autoSliceOnSpeechEnd: true,
        },
        {
          onTranscribe: (event) => {
            if (!this.isRunning) return;
            const text = event.data?.result?.trim();
            if (text) {
              this.emitResult({ text, isFinal: !event.isCapturing });
            }
          },
          onError: (error) => {
            this.emitError(new Error(error));
          },
        },
      );

      await this.transcriber.start();
    } catch (err) {
      this.isRunning = false;
      this.emitError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.transcriber) {
      await this.transcriber.stop().catch(() => {});
      await this.transcriber.release().catch(() => {});
      this.transcriber = null;
    }
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
        if (msg.includes('getConstants') || msg.includes('NativeModule') || msg.includes('Cannot find module')) {
          throw new Error(this.getWhisperUnavailableMessage());
        }
      }
      throw error;
    }
  }

  private requireRealtimeTranscriber(): RealtimeTranscriberModule {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('whisper.rn/src/realtime-transcription') as RealtimeTranscriberModule;
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
