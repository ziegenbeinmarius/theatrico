// ─── Annotation types ─────────────────────────────────────────────────────────

export type AnnotationType = 'note' | 'cue';
export type CueType = 'lighting' | 'sound' | 'stage_direction' | 'custom';

export interface CueContent {
  cue_type: CueType;
  description: string;
}

export interface Annotation {
  id: number;
  script_id: string;
  line_index: number;
  type: AnnotationType;
  content: string;
  created_at: string;
  updated_at: string;
}

// ─── Domain types ────────────────────────────────────────────────────────────

export type LineType = 'dialogue' | 'action' | 'stage_direction';

export interface Line {
  id: string;
  order: number;
  text: string;
  character: string;
  type: LineType;
}

export interface Scene {
  id: string;
  order: number;
  title: string;
  lines: Line[];
}

export interface Act {
  id: string;
  order: number;
  title: string;
  scenes: Scene[];
}

export interface Play {
  id: string;
  title: string;
  description: string;
  acts: Act[];
}

export type SessionStatus = 'active' | 'paused' | 'ended';

export interface Position {
  playId: string;
  actId: string;
  sceneId: string;
  lineId: string;
}

export interface Session {
  id: string;
  code: string;
  playId: string;
  status: SessionStatus;
  currentPosition: Position | null;
  play?: Play;
}

// ─── Raw API response types (backend wire format) ─────────────────────────────

export interface RawLine {
  id: number;
  character: string;
  text: string;
}

export interface RawScene {
  title: string;
  lines: RawLine[];
}

export interface RawAct {
  title: string;
  scenes: RawScene[];
}

export interface RawScript {
  title: string;
  acts: RawAct[];
}

export interface RawCreateSession {
  join_code: string;
  qr_url: string;
  language: string;
  script_title: string;
}

export interface RawGetSession {
  join_code: string;
  script: RawScript;
  cursor: number;
  paused: boolean;
  clients: number;
  chunk_duration_ms?: number;
  language: string;
}

export interface RawPlayInfo {
  id: string;
  title: string;
}

export interface RawPlayDetail {
  id: string;
  title: string;
  script: RawScript;
}

// ─── Shared helpers for parsing raw API responses ────────────────────────────

export function parseRawScript(raw: RawScript): Play {
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

export function cursorToPosition(play: Play, cursor: number): Position | null {
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

// ─── WebSocket message types ──────────────────────────────────────────────────

export interface WsCueInfo {
  id: number;
  content: string;
}

export interface PositionUpdateMessage {
  type: 'position_update';
  line?: number;
  act?: number;
  scene?: number;
  position?: Position;
  cues?: WsCueInfo[];
}

export interface TranscriptMessage {
  type: 'transcript';
  text: string;
  isFinal: boolean;
  timestamp: string;
}

export interface ErrorMessage {
  type: 'error';
  code: string;
  message: string;
}

export type SessionMessage = PositionUpdateMessage | TranscriptMessage | ErrorMessage;

// ─── Service interfaces ───────────────────────────────────────────────────────

export interface ITheatricoClient {
  listScripts(): Promise<Play[]>;
  createSession(playId: string): Promise<Session>;
  getSession(code: string): Promise<Session>;
  updatePosition(code: string, position: Position): Promise<void>;
  updateStatus(code: string, status: SessionStatus): Promise<void>;
  deleteScript(id: string): Promise<void>;
}

export interface ISessionWebSocket {
  connect(): void;
  disconnect(): void;
  onMessage(handler: (msg: SessionMessage) => void): void;
  offMessage(handler: (msg: SessionMessage) => void): void;
  onOpen(handler: () => void): void;
  offOpen(handler: () => void): void;
  onClose(handler: () => void): void;
  offClose(handler: () => void): void;
  onGiveUp(handler: () => void): void;
  offGiveUp(handler: () => void): void;
}

export interface IAudioWebSocket {
  connect(): void;
  disconnect(): void;
  sendAudioChunk(chunk: ArrayBuffer): void;
  sendFlush(): void;
}
