import type { ISpeechRecognizer } from './ISpeechRecognizer';
import { WhisperRecognizer, type WhisperModelOptions } from './WhisperRecognizer';
import { NativeRecognizer } from './NativeRecognizer';

export function createSpeechRecognizer(
  type: 'whisper' | 'native',
  whisperOptions?: WhisperModelOptions,
): ISpeechRecognizer {
  switch (type) {
    case 'whisper':
      return new WhisperRecognizer(whisperOptions ?? {});
    case 'native':
      return new NativeRecognizer();
  }
}
