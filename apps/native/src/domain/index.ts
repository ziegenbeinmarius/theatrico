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

// WebSocket message types

export interface PositionUpdateMessage {
  type: 'position_update';
  // Backend sends integer indices; position is derived client-side from the flat lines array
  line?: number;     // SeqIdx — 0-based cursor in the flattened script
  act?: number;      // ActIdx (informational)
  scene?: number;    // SceneIdx (informational)
  position?: Position; // Used internally when position is already resolved
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

// Service interfaces

export interface ITheatricoClient {
  listPlays(): Promise<Play[]>;
  createSession(playId: string): Promise<Session>;
  getSession(code: string): Promise<Session>;
  updatePosition(code: string, position: Position): Promise<void>;
  updateStatus(code: string, status: SessionStatus): Promise<void>;
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
