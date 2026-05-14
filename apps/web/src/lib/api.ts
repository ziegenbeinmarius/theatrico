import type { Annotation } from '@theatrico/shared';
import { CreateSessionResponse, PlayDetail, PlayInfo, SessionInfo, SessionSummary } from '../types';

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

export function listSessions() {
  return request<SessionSummary[]>('/api/sessions');
}

export function getSession(code: string) {
  return request<SessionInfo>(`/api/sessions/${code.toUpperCase()}`);
}

export async function deleteSession(code: string) {
  const response = await fetch(`/api/sessions/${encodeURIComponent(code)}`, { method: 'DELETE' });
  if (!response.ok && response.status !== 204) {
    const message = (await response.text()).trim();
    throw new Error(message || `Delete failed with ${response.status}`);
  }
}

export function getScripts() {
  return request<PlayInfo[]>('/api/scripts');
}

export function getScript(id: string) {
  return request<PlayDetail>(`/api/scripts/${encodeURIComponent(id)}`);
}

export function createSession(params: { language?: string; scriptId?: string }) {
  return request<CreateSessionResponse>('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language: params.language ?? '', script_id: params.scriptId ?? '' }),
  });
}

export function uploadScript(file: File, title: string) {
  const form = new FormData();
  form.append('script', file);
  form.append('title', title);
  return request<PlayDetail>('/api/scripts', { method: 'POST', body: form });
}

export async function deleteScript(id: string) {
  const response = await fetch(`/api/scripts/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) {
    const message = (await response.text()).trim();
    throw new Error(message || `Delete failed with ${response.status}`);
  }
}

export function getAnnotations(scriptId: string) {
  return request<Annotation[]>(`/api/scripts/${encodeURIComponent(scriptId)}/annotations`);
}

export function createAnnotation(scriptId: string, lineIndex: number, type: string, content: string) {
  return request<Annotation>(`/api/scripts/${encodeURIComponent(scriptId)}/annotations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ line_index: lineIndex, type, content }),
  });
}

export function updateAnnotation(id: number, type: string, content: string) {
  return request<Annotation>(`/api/annotations/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, content }),
  });
}

export async function deleteAnnotation(id: number) {
  const response = await fetch(`/api/annotations/${id}`, { method: 'DELETE' });
  if (!response.ok) {
    const message = (await response.text()).trim();
    throw new Error(message || `Delete failed with ${response.status}`);
  }
}

export function login(username: string, password: string) {
  return request<{ token: string }>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
}

export async function logout() {
  const response = await fetch('/api/auth/logout', { method: 'POST' });
  if (!response.ok && response.status !== 204) {
    throw new Error(`Logout failed with ${response.status}`);
  }
}

export async function checkAuth(): Promise<boolean> {
  try {
    await getScripts();
    return true;
  } catch {
    return false;
  }
}
