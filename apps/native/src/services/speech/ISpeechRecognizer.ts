export interface RecognizeOptions {
  language?: string;
  contextHint?: string;
}

export interface RecognitionResult {
  text: string;
  isFinal: boolean;
  confidence?: number;
}

export interface ISpeechRecognizer {
  readonly type: 'whisper' | 'native';
  start(options: RecognizeOptions): Promise<void>;
  stop(): Promise<void>;
  onResult(cb: (result: RecognitionResult) => void): () => void;
  onError(cb: (err: Error) => void): () => void;
}
