import { CreateSessionResponse, PlayDetail, PlayInfo, SessionInfo } from '../types';

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

export function getSession(code: string) {
  return request<SessionInfo>(`/api/sessions/${code.toUpperCase()}`);
}

export function getPlays() {
  return request<PlayInfo[]>('/api/plays');
}

export function getPlay(id: string) {
  return request<PlayDetail>(`/api/plays/${encodeURIComponent(id)}`);
}

export function createSession(params: { language?: string; scriptId?: string }) {
  return request<CreateSessionResponse>('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language: params.language ?? '', script_id: params.scriptId ?? '' }),
  });
}
