import { CreateSessionResponse, Script, SessionInfo } from '../types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      Accept: 'application/json',
      ...init?.headers,
    },
    ...init,
  });

  if (!response.ok) {
    const message = (await response.text()).trim();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getScript() {
  return request<Script>('/api/script');
}

export function getSession(code: string) {
  return request<SessionInfo>(`/api/sessions/${code.toUpperCase()}`);
}

export function createSession(language = '') {
  return request<CreateSessionResponse>('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language }),
  });
}
