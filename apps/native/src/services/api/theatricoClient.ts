import { config } from '@/lib/config';
import type { ITheatricoClient, LineType, Play, Position, Session, SessionStatus } from '@/domain';

type RawLine = { id: number; character: string; text: string };
type RawScene = { title: string; lines: RawLine[] };
type RawAct = { title: string; scenes: RawScene[] };
type RawScript = { title: string; acts: RawAct[] };

type RawCreateSession = {
  join_code: string;
  qr_url: string;
  language: string;
  script_title: string;
};

type RawGetSession = {
  join_code: string;
  script: RawScript;
  cursor: number;
  paused: boolean;
  clients: number;
  chunk_duration_ms: number;
  language: string;
};

function parseRawScript(raw: RawScript): Play {
  return {
    id: raw.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    title: raw.title,
    description: '',
    acts: raw.acts.map((rawAct, actIdx) => ({
      id: `act-${actIdx}`,
      order: actIdx,
      title: rawAct.title,
      scenes: rawAct.scenes.map((rawScene, sceneIdx) => ({
        id: `act-${actIdx}-scene-${sceneIdx}`,
        order: sceneIdx,
        title: rawScene.title,
        lines: rawScene.lines.map((rawLine, lineIdx) => ({
          id: String(rawLine.id),
          order: lineIdx,
          text: rawLine.text,
          character: rawLine.character,
          type: 'dialogue' as LineType,
        })),
      })),
    })),
  };
}

function cursorToPosition(play: Play, cursor: number): Position | null {
  let idx = 0;
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      for (const line of scene.lines) {
        if (idx === cursor) {
          return { playId: play.id, actId: act.id, sceneId: scene.id, lineId: line.id };
        }
        idx++;
      }
    }
  }
  return null;
}

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
