import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ISpeechRecognizer } from '@/services/speech/ISpeechRecognizer';
import { createSpeechRecognizer } from '@/services/speech/SpeechRecognizerFactory';
import { useSettings, WHISPER_MODEL_URLS } from '@/context/SettingsContext';

interface SpeechRecognizerContextValue {
  recognizer: ISpeechRecognizer;
  switchRecognizer: (type: 'whisper' | 'native') => void;
}

const SpeechRecognizerContext = createContext<SpeechRecognizerContextValue | null>(null);

function buildRecognizer(
  preference: 'whisper' | 'native',
  modelSize: keyof typeof WHISPER_MODEL_URLS,
): ISpeechRecognizer {
  if (preference === 'whisper') {
    return createSpeechRecognizer('whisper', {
      modelUrl: WHISPER_MODEL_URLS[modelSize].url,
    });
  }
  return createSpeechRecognizer('native');
}

export function SpeechRecognizerProvider({ children }: { children: React.ReactNode }) {
  const { settings, updateSettings } = useSettings();

  const [recognizer, setRecognizer] = useState<ISpeechRecognizer>(() =>
    buildRecognizer(settings.recognizerPreference, settings.whisperModelSize),
  );

  useEffect(() => {
    setRecognizer(buildRecognizer(settings.recognizerPreference, settings.whisperModelSize));
  }, [settings.recognizerPreference, settings.whisperModelSize]);

  const switchRecognizer = useCallback(
    (type: 'whisper' | 'native') => {
      updateSettings({ recognizerPreference: type });
    },
    [updateSettings],
  );

  return (
    <SpeechRecognizerContext.Provider value={{ recognizer, switchRecognizer }}>
      {children}
    </SpeechRecognizerContext.Provider>
  );
}

export function useSpeechRecognizerContext(): SpeechRecognizerContextValue {
  const ctx = useContext(SpeechRecognizerContext);
  if (!ctx) {
    throw new Error('useSpeechRecognizerContext must be used within SpeechRecognizerProvider');
  }
  return ctx;
}
