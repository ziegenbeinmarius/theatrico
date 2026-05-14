import { config } from '@/lib/config';
import {
  parseRawScript,
  cursorToPosition,
  type Annotation,
  type ITheatricoClient,
  type Play,
  type Position,
  type RawCreateSession,
  type RawGetSession,
  type RawPlayDetail,
  type Session,
  type SessionStatus,
} from '@theatrico/shared';

interface SessionSummary {
  join_code: string;
  script_id: string;
  script_title: string;
  cursor: number;
  paused: boolean;
  created_at: string;
}

class TheatricoClient implements ITheatricoClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private authHeaders(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.authHeaders(),
      ...(init?.headers as Record<string, string> | undefined),
    };
    const res = await fetch(`${config.backendUrl}${path}`, { ...init, headers });
    if (!res.ok) {
      throw new Error(`API ${init?.method ?? 'GET'} ${path} failed: ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  private async requestVoid(path: string, init?: RequestInit): Promise<void> {
    const headers: Record<string, string> = {
      ...this.authHeaders(),
      ...(init?.headers as Record<string, string> | undefined),
    };
    const res = await fetch(`${config.backendUrl}${path}`, { ...init, headers });
    if (!res.ok && res.status !== 204) {
      const msg = await res.text().catch(() => '');
      throw new Error(msg || `API ${init?.method ?? 'DELETE'} ${path} failed: ${res.status}`);
    }
  }

  listScripts(): Promise<Play[]> {
    return this.request<Play[]>('/api/scripts');
  }

  async createSession(playId: string): Promise<Session> {
    const raw = await this.request<RawCreateSession>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ script_id: playId }),
    });
    return {
      id: raw.join_code,
      code: raw.join_code,
      playId,
      scriptId: playId,
      status: 'active',
      currentPosition: null,
    };
  }

  async getSession(code: string): Promise<Session> {
    const raw = await this.request<RawGetSession>(`/api/sessions/${encodeURIComponent(code)}`);
    const play = parseRawScript(raw.script);
    return {
      id: raw.join_code,
      code: raw.join_code,
      playId: play.id,
      scriptId: raw.script_id,
      status: raw.paused ? 'paused' : 'active',
      currentPosition: cursorToPosition(play, raw.cursor),
      play,
    };
  }

  updatePosition(code: string, position: Position): Promise<void> {
    return this.request<void>(`/api/sessions/${encodeURIComponent(code)}/position`, {
      method: 'PATCH',
      body: JSON.stringify(position),
    });
  }

  updateStatus(code: string, status: SessionStatus): Promise<void> {
    return this.request<void>(`/api/sessions/${encodeURIComponent(code)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  async uploadScript(uri: string, fileName: string, title: string): Promise<RawPlayDetail> {
    const form = new FormData();
    // React Native FormData accepts { uri, name, type } as a blob-like object
    form.append('script', { uri, name: fileName, type: 'text/markdown' } as unknown as Blob);
    form.append('title', title);
    const res = await fetch(`${config.backendUrl}/api/scripts`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: form,
    });
    if (!res.ok) {
      const msg = (await res.text()).trim();
      throw new Error(msg || `Upload failed: ${res.status}`);
    }
    return res.json() as Promise<RawPlayDetail>;
  }

  deleteScript(id: string): Promise<void> {
    return this.requestVoid(`/api/scripts/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  getScript(id: string): Promise<RawPlayDetail> {
    return this.request<RawPlayDetail>(`/api/scripts/${encodeURIComponent(id)}`);
  }

  getAnnotations(scriptId: string): Promise<Annotation[]> {
    return this.request<Annotation[]>(`/api/scripts/${encodeURIComponent(scriptId)}/annotations`);
  }

  createAnnotation(scriptId: string, lineIndex: number, type: string, content: string): Promise<Annotation> {
    return this.request<Annotation>(`/api/scripts/${encodeURIComponent(scriptId)}/annotations`, {
      method: 'POST',
      body: JSON.stringify({ line_index: lineIndex, type, content }),
    });
  }

  updateAnnotation(id: number, type: string, content: string): Promise<Annotation> {
    return this.request<Annotation>(`/api/annotations/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ type, content }),
    });
  }

  deleteAnnotation(id: number): Promise<void> {
    return this.requestVoid(`/api/annotations/${id}`, { method: 'DELETE' });
  }

  listSessions(): Promise<SessionSummary[]> {
    return this.request<SessionSummary[]>('/api/sessions');
  }

  deleteSession(code: string): Promise<void> {
    return this.requestVoid(`/api/sessions/${encodeURIComponent(code)}`, { method: 'DELETE' });
  }
}

export const theatricoClient = new TheatricoClient();
export type { SessionSummary };
