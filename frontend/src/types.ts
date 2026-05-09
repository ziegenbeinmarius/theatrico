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
