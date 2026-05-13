export type {
  RawLine as ScriptLine,
  RawScene as ScriptScene,
  RawAct as ScriptAct,
  RawScript as Script,
  RawGetSession as SessionInfo,
  RawCreateSession as CreateSessionResponse,
  RawPlayInfo as PlayInfo,
  RawPlayDetail as PlayDetail,
} from '@theatrico/shared';

// Web-specific WebSocket message shapes (backend wire format for the web WS endpoint)
export interface CueInfo {
  id: number;
  content: string;
}

export interface PositionUpdate {
  type: 'position_update';
  act: number;
  scene: number;
  line: number;
  timestamp: string;
  cues?: CueInfo[];
}

export interface PausedUpdate {
  type: 'paused';
  paused: boolean;
}

export interface TranscriptUpdate {
  type: 'transcript';
  text: string;
}

export interface AudioErrorUpdate {
  type: 'error';
  message: string;
}

export interface StatusMsg {
  type: 'status';
  cursor: number;
  paused: boolean;
  clients: number;
}

export type WsMessage = PositionUpdate | PausedUpdate | TranscriptUpdate | AudioErrorUpdate | StatusMsg;
