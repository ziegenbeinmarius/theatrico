import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setBackendUrl } from '@/lib/config';

const STORAGE_KEY = '@theatrico/settings';

export type RecognizerPreference = 'whisper' | 'native';
export type WhisperModelSize = 'tiny' | 'base' | 'small';

export interface WhisperModelInfo {
  url: string;
  sizeLabel: string;
  estimatedSeconds: number;
}

export const WHISPER_MODEL_URLS: Record<WhisperModelSize, WhisperModelInfo> = {
  tiny: {
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
    sizeLabel: '75 MB',
    estimatedSeconds: 30,
  },
  base: {
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
    sizeLabel: '142 MB',
    estimatedSeconds: 60,
  },
  small: {
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
    sizeLabel: '466 MB',
    estimatedSeconds: 180,
  },
};

export const SUPPORTED_LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'German' },
  { code: 'fr', label: 'French' },
  { code: 'es', label: 'Spanish' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ko', label: 'Korean' },
  { code: 'ru', label: 'Russian' },
  { code: 'sv', label: 'Swedish' },
];

export interface Settings {
  backendUrl: string;
  recognizerPreference: RecognizerPreference;
  whisperModelSize: WhisperModelSize;
  language: string;
}

export const DEFAULT_SETTINGS: Settings = {
  backendUrl: 'https://theatrico.fly.dev',
  // Native SFSpeechRecognizer on iOS: ~100-300ms word-level streaming — right for cues.
  // Whisper on Android: no native streaming equivalent; falls back to 2s slice inference.
  recognizerPreference: Platform.OS === 'ios' ? 'native' : 'whisper',
  whisperModelSize: 'tiny',
  language: 'en',
};

interface SettingsContextValue {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as Partial<Settings>;
        const merged: Settings = { ...DEFAULT_SETTINGS, ...parsed };
        setSettings(merged);
        setBackendUrl(merged.backendUrl);
      } catch {}
    });
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next: Settings = { ...prev, ...patch };
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      if (patch.backendUrl !== undefined) {
        setBackendUrl(next.backendUrl);
      }
      return next;
    });
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return ctx;
}
