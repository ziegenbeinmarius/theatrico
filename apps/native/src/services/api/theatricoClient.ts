import { config } from '@/lib/config';
import {
  parseRawScript,
  cursorToPosition,
  type ITheatricoClient,
  type Play,
  type Position,
  type RawCreateSession,
  type RawGetSession,
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

  listPlays(): Promise<Play[]> {
    return this.request<Play[]>('/api/plays');
  }

  async createSession(playId: string): Promise<Session> {
    const raw = await this.request<RawCreateSession>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ playId }),
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
}

export const theatricoClient: ITheatricoClient = new TheatricoClient();
