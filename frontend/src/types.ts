export interface ScriptLine {
  id: number;
  character: string;
  text: string;
}

export interface ScriptScene {
  title: string;
  lines: ScriptLine[];
}

export interface ScriptAct {
  title: string;
  scenes: ScriptScene[];
}

export interface Script {
  title: string;
  acts: ScriptAct[];
}

export interface SessionInfo {
  join_code: string;
  script: Script;
  cursor: number;
  paused: boolean;
  clients: number;
}

export interface CreateSessionResponse {
  join_code: string;
  qr_url: string;
}

export interface PositionUpdate {
  type: 'position_update';
  act: number;
  scene: number;
  line: number;
  timestamp: string;
}

export interface PausedUpdate {
  type: 'paused';
  paused: boolean;
}

export interface TranscriptUpdate {
  type: 'transcript';
  text: string;
}

export interface StatusMsg {
  type: 'status';
  cursor: number;
  paused: boolean;
  clients: number;
}

export type WsMessage = PositionUpdate | PausedUpdate | TranscriptUpdate | StatusMsg;
