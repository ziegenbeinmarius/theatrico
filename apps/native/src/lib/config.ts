import Constants from 'expo-constants';

export function resolveDefaultBackendUrl(): string {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const envUrl = extra?.['BACKEND_URL'];
  if (typeof envUrl === 'string' && envUrl.length > 0) {
    return envUrl;
  }
  if (__DEV__) {
    const hostUri = Constants.expoConfig?.hostUri;
    if (typeof hostUri === 'string' && hostUri.length > 0) {
      const host = hostUri.split(':')[0];
      return `http://${host}:8085`;
    }
  }
  return 'https://theatrico.fly.dev';
}

let _backendUrl = resolveDefaultBackendUrl();

export const config = {
  get backendUrl(): string {
    return _backendUrl;
  },
} as const;

export function setBackendUrl(url: string): void {
  _backendUrl = url;
}
