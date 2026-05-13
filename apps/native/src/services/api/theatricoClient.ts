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

class TheatricoClient implements ITheatricoClient {
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${config.backendUrl}${path}`, {
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      ...init,
    });

    if (!res.ok) {
      throw new Error(`API ${init?.method ?? 'GET'} ${path} failed: ${res.status}`);
    }

    return res.json() as Promise<T>;
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
      body: form,
    });
    if (!res.ok) {
      const msg = (await res.text()).trim();
      throw new Error(msg || `Upload failed: ${res.status}`);
    }
    return res.json() as Promise<RawPlayDetail>;
  }

  async deleteScript(id: string): Promise<void> {
    const res = await fetch(`${config.backendUrl}/api/scripts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const msg = (await res.text()).trim();
      throw new Error(msg || `Delete failed: ${res.status}`);
    }
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

  async deleteAnnotation(id: number): Promise<void> {
    const res = await fetch(`${config.backendUrl}/api/annotations/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const msg = (await res.text()).trim();
      throw new Error(msg || `Delete failed: ${res.status}`);
    }
  }
}

export const theatricoClient: ITheatricoClient = new TheatricoClient();
