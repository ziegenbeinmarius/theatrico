import { config } from '@/lib/config';
import type { ISessionWebSocket, Position, SessionMessage } from '@/domain';

const BASE_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 10;

// The backend sends position_update as {act, scene, line} (integer indices).
// Translate to domain Position using the same ID scheme as theatricoClient.
function buildPosition(act: number, scene: number, line: number): Position {
  return {
    playId: '',
    actId: `act-${act}`,
    sceneId: `act-${act}-scene-${scene}`,
    lineId: String(line),
  };
}

function normalizeBackendMessage(raw: Record<string, unknown>): SessionMessage | null {
  if (raw.type === 'position_update' && typeof raw.line === 'number') {
    return {
      type: 'position_update',
      position: buildPosition(
        typeof raw.act === 'number' ? raw.act : 0,
        typeof raw.scene === 'number' ? raw.scene : 0,
        raw.line,
      ),
    };
  }
  if (raw.type === 'transcript') {
    return {
      type: 'transcript',
      text: typeof raw.text === 'string' ? raw.text : '',
      isFinal: typeof raw.isFinal === 'boolean' ? raw.isFinal : true,
      timestamp: typeof raw.timestamp === 'string' ? raw.timestamp : new Date().toISOString(),
    };
  }
  if (raw.type === 'error') {
    return {
      type: 'error',
      code: typeof raw.code === 'string' ? raw.code : 'unknown',
      message: typeof raw.message === 'string' ? raw.message : 'Unknown error',
    };
  }
  return null;
}

export class SessionWebSocket implements ISessionWebSocket {
  private readonly url: string;
  private ws: WebSocket | null = null;
  private handlers = new Set<(msg: SessionMessage) => void>();
  private openHandlers = new Set<() => void>();
  private closeHandlers = new Set<() => void>();
  private giveUpHandlers = new Set<() => void>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;

  constructor(sessionCode: string) {
    const wsBase = config.backendUrl.replace(/^http/, 'ws');
    this.url = `${wsBase}/api/sessions/${encodeURIComponent(sessionCode)}/ws`;
  }

  connect(): void {
    this.shouldReconnect = true;
    this.openSocket();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  onMessage(handler: (msg: SessionMessage) => void): void {
    this.handlers.add(handler);
  }

  offMessage(handler: (msg: SessionMessage) => void): void {
    this.handlers.delete(handler);
  }

  onOpen(handler: () => void): void {
    this.openHandlers.add(handler);
  }
  offOpen(handler: () => void): void {
    this.openHandlers.delete(handler);
  }
  onClose(handler: () => void): void {
    this.closeHandlers.add(handler);
  }
  offClose(handler: () => void): void {
    this.closeHandlers.delete(handler);
  }
  onGiveUp(handler: () => void): void {
    this.giveUpHandlers.add(handler);
  }
  offGiveUp(handler: () => void): void {
    this.giveUpHandlers.delete(handler);
  }

  private openSocket(): void {
    const ws = new WebSocket(this.url);

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.openHandlers.forEach((h) => h());
    };

    ws.onmessage = (event) => {
      try {
        const raw = JSON.parse(event.data as string) as Record<string, unknown>;
        const msg = normalizeBackendMessage(raw);
        if (msg) this.handlers.forEach((h) => h(msg));
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      this.ws = null;
      if (this.shouldReconnect) {
        this.closeHandlers.forEach((h) => h());
        this.scheduleReconnect();
      }
    };

    ws.onerror = () => {
      // onclose fires after onerror, so reconnect is handled there
    };

    this.ws = ws;
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.giveUpHandlers.forEach((h) => h());
      return;
    }

    const delay = Math.min(
      BASE_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts),
      MAX_RECONNECT_DELAY_MS,
    );
    this.reconnectAttempts += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) {
        this.openSocket();
      }
    }, delay);
  }
}

export function createSessionWebSocket(sessionCode: string): ISessionWebSocket {
  return new SessionWebSocket(sessionCode);
}

export const defaultSessionWebSocket = {
  forSession: (code: string) => new SessionWebSocket(code),
};

// Convenience factory wired to the default backend
export function sessionWebSocketFactory(code: string): ISessionWebSocket {
  return createSessionWebSocket(code);
}
