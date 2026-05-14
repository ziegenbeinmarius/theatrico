import Constants from 'expo-constants';

function configuredBackendUrl(): string | null {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const envUrl = extra?.['BACKEND_URL'];
  if (typeof envUrl === 'string' && envUrl.length > 0) {
    return envUrl;
  }
  return null;
}

export function hasConfiguredBackendUrl(): boolean {
  return configuredBackendUrl() !== null;
}

export function resolveDefaultBackendUrl(): string {
  const envUrl = configuredBackendUrl();
  if (envUrl) {
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
