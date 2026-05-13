import type { ISpeechRecognizer, RecognitionResult, RecognizeOptions } from './ISpeechRecognizer';

type VoiceModule = {
  default: {
    start: (locale: string) => Promise<void>;
    stop: () => Promise<void>;
    destroy: () => Promise<void>;
    onSpeechResults: ((e: { value?: string[] }) => void) | null;
    onSpeechPartialResults: ((e: { value?: string[] }) => void) | null;
    onSpeechError: ((e: { error?: { message?: string; code?: string } }) => void) | null;
    onSpeechEnd: (() => void) | null;
  };
};

export class NativeRecognizer implements ISpeechRecognizer {
  readonly type = 'native' as const;

  private resultListeners: Set<(r: RecognitionResult) => void> = new Set();
  private errorListeners: Set<(e: Error) => void> = new Set();
  private isRunning = false;
  private locale = 'en-US';
  private lastFinalText = '';
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

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
    this.locale = this.toLocale(options.language);
    this.lastFinalText = '';
    this.isRunning = true;

    const Voice = this.requireVoice();

    Voice.onSpeechPartialResults = (e) => {
      const text = e.value?.[0]?.trim();
      if (text) this.emitResult({ text, isFinal: false });
    };

    Voice.onSpeechResults = (e) => {
      const text = e.value?.[0]?.trim();
      // Deduplicate: restarting causes the same audio to re-transcribe
      if (text && text !== this.lastFinalText) {
        this.lastFinalText = text;
        this.emitResult({ text, isFinal: true });
      }
    };

    Voice.onSpeechEnd = () => {
      if (!this.isRunning) return;
      // Delay restart so the audio buffer clears before the new session begins
      this.restartTimer = setTimeout(() => {
        if (this.isRunning) {
          Voice.start(this.locale).catch((err: unknown) => {
            this.emitError(err instanceof Error ? err : new Error(String(err)));
          });
        }
      }, 400);
    };

    Voice.onSpeechError = (e) => {
      if (!this.isRunning) return;
      // Code 203 = "Retry" — transient error from SFSpeechRecognizer; restart silently
      if (e.error?.code === '203' || e.error?.message?.includes('203')) {
        this.restartTimer = setTimeout(() => {
          if (this.isRunning) Voice.start(this.locale).catch(() => {});
        }, 400);
        return;
      }
      this.emitError(new Error(e.error?.message ?? 'Speech recognition error'));
    };

    await Voice.start(this.locale);
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    const Voice = this.requireVoice();
    Voice.onSpeechResults = null;
    Voice.onSpeechPartialResults = null;
    Voice.onSpeechEnd = null;
    Voice.onSpeechError = null;

    await Voice.stop().catch(() => {});
    await Voice.destroy().catch(() => {});
  }

  private toLocale(language?: string): string {
    const map: Record<string, string> = {
      en: 'en-US', de: 'de-DE', fr: 'fr-FR', es: 'es-ES',
      it: 'it-IT', pt: 'pt-BR', ja: 'ja-JP', zh: 'zh-CN',
      ko: 'ko-KR', ru: 'ru-RU', sv: 'sv-SE',
    };
    return map[language ?? 'en'] ?? language ?? 'en-US';
  }

  private requireVoice(): VoiceModule['default'] {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('@react-native-voice/voice') as Partial<VoiceModule>;
      if (typeof mod?.default?.start !== 'function') {
        throw new Error('Native speech recognition requires a development build — not available in Expo Go.');
      }
      return mod.default as VoiceModule['default'];
    } catch (e) {
      throw e instanceof Error ? e : new Error('Native speech recognition is unavailable.');
    }
  }

  private emitResult(result: RecognitionResult): void {
    this.resultListeners.forEach((cb) => cb(result));
  }

  private emitError(err: Error): void {
    this.errorListeners.forEach((cb) => cb(err));
  }
}
