import { useSpeechRecognizerContext } from '@/context/SpeechRecognizerContext';

export function useSpeechRecognizer() {
  return useSpeechRecognizerContext();
}
