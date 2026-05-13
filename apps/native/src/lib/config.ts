import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL_KEY = '@theatrico/backend_url';

function resolveDefaultBackendUrl(): string {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const envUrl = extra?.['BACKEND_URL'];
  if (typeof envUrl === 'string' && envUrl.length > 0) {
    return envUrl;
  }
  return 'https://theatrico.fly.dev';
}

let _backendUrl = resolveDefaultBackendUrl();

// Hydrate from persisted settings on startup (non-blocking; first request uses env/default)
AsyncStorage.getItem(BACKEND_URL_KEY).then((saved) => {
  if (typeof saved === 'string' && saved.length > 0) {
    _backendUrl = saved;
  }
});

export const config = {
  get backendUrl(): string {
    return _backendUrl;
  },
} as const;

export function setBackendUrl(url: string): void {
  _backendUrl = url;
  void AsyncStorage.setItem(BACKEND_URL_KEY, url);
}
