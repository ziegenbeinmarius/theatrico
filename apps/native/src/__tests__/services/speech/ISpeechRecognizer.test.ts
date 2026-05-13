import type {
  ISpeechRecognizer,
  RecognitionResult,
  RecognizeOptions,
} from '@/services/speech/ISpeechRecognizer';

// Mock implementation for contract testing
class MockSpeechRecognizer implements ISpeechRecognizer {
  readonly type: 'whisper' | 'native';
  private resultListeners: Set<(r: RecognitionResult) => void> = new Set();
  private errorListeners: Set<(e: Error) => void> = new Set();
  public started = false;
  public stopped = false;
  public lastOptions: RecognizeOptions | null = null;

  constructor(type: 'whisper' | 'native' = 'native') {
    this.type = type;
  }

  async start(options: RecognizeOptions): Promise<void> {
    this.started = true;
    this.lastOptions = options;
  }

  async stop(): Promise<void> {
    this.stopped = true;
  }

  onResult(cb: (result: RecognitionResult) => void): () => void {
    this.resultListeners.add(cb);
    return () => this.resultListeners.delete(cb);
  }

  onError(cb: (err: Error) => void): () => void {
    this.errorListeners.add(cb);
    return () => this.errorListeners.delete(cb);
  }

  // Test helpers to simulate events
  simulateResult(result: RecognitionResult): void {
    this.resultListeners.forEach((cb) => cb(result));
  }

  simulateError(err: Error): void {
    this.errorListeners.forEach((cb) => cb(err));
  }
}

function createMockRecognizer(type: 'whisper' | 'native' = 'native'): MockSpeechRecognizer {
  return new MockSpeechRecognizer(type);
}

// Verifies ISpeechRecognizer contract for a given implementation
function describeISpeechRecognizerContract(label: string, factory: () => MockSpeechRecognizer) {
  describe(`ISpeechRecognizer contract — ${label}`, () => {
    let recognizer: MockSpeechRecognizer;

    beforeEach(() => {
      recognizer = factory();
    });

    it('exposes a type property of "whisper" or "native"', () => {
      expect(['whisper', 'native']).toContain(recognizer.type);
    });

    it('start() resolves and records options', async () => {
      const opts: RecognizeOptions = { language: 'en-US', contextHint: 'Hamlet' };
      await recognizer.start(opts);
      expect(recognizer.started).toBe(true);
      expect(recognizer.lastOptions).toEqual(opts);
    });

    it('stop() resolves', async () => {
      await recognizer.start({});
      await recognizer.stop();
      expect(recognizer.stopped).toBe(true);
    });

    it('onResult() subscribes and returns an unsubscribe function', () => {
      const cb = jest.fn();
      const unsubscribe = recognizer.onResult(cb);

      const result: RecognitionResult = { text: 'Hello', isFinal: false };
      recognizer.simulateResult(result);
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith(result);

      unsubscribe();
      recognizer.simulateResult({ text: 'World', isFinal: true });
      expect(cb).toHaveBeenCalledTimes(1); // not called again
    });

    it('onError() subscribes and returns an unsubscribe function', () => {
      const cb = jest.fn();
      const unsubscribe = recognizer.onError(cb);

      const err = new Error('recognition failed');
      recognizer.simulateError(err);
      expect(cb).toHaveBeenCalledWith(err);

      unsubscribe();
      recognizer.simulateError(new Error('another error'));
      expect(cb).toHaveBeenCalledTimes(1); // not called again
    });

    it('multiple result listeners are all notified', () => {
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      recognizer.onResult(cb1);
      recognizer.onResult(cb2);

      const result: RecognitionResult = { text: 'test', isFinal: true, confidence: 0.9 };
      recognizer.simulateResult(result);

      expect(cb1).toHaveBeenCalledWith(result);
      expect(cb2).toHaveBeenCalledWith(result);
    });

    it('RecognitionResult includes text and isFinal; confidence is optional', () => {
      const cb = jest.fn();
      recognizer.onResult(cb);

      const withConfidence: RecognitionResult = { text: 'hi', isFinal: true, confidence: 0.8 };
      const withoutConfidence: RecognitionResult = { text: 'hi', isFinal: false };

      recognizer.simulateResult(withConfidence);
      recognizer.simulateResult(withoutConfidence);

      expect(cb).toHaveBeenCalledTimes(2);
    });

    it('start() with empty options does not throw', async () => {
      await expect(recognizer.start({})).resolves.toBeUndefined();
    });
  });
}

// Run the contract against both mock implementations
describeISpeechRecognizerContract('whisper mock', () => createMockRecognizer('whisper'));
describeISpeechRecognizerContract('native mock', () => createMockRecognizer('native'));
