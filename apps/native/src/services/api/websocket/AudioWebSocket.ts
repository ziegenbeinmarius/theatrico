import { config } from '@/lib/config';
import type { IAudioWebSocket } from '@/domain';

const BASE_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 10;

export class AudioWebSocket implements IAudioWebSocket {
  private readonly url: string;
  private ws: WebSocket | null = null;
  private pendingChunks: ArrayBuffer[] = [];
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;

  constructor(sessionCode: string) {
    const wsBase = config.backendUrl.replace(/^http/, 'ws');
    this.url = `${wsBase}/api/sessions/${encodeURIComponent(sessionCode)}/audio`;
  }

  connect(): void {
    this.shouldReconnect = true;
    this.openSocket();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.pendingChunks = [];
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  sendAudioChunk(chunk: ArrayBuffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(chunk);
    } else {
      this.pendingChunks.push(chunk);
    }
  }

  sendFlush(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'flush' }));
    }
  }

  private openSocket(): void {
    const ws = new WebSocket(this.url);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      const pending = this.pendingChunks.splice(0);
      pending.forEach((chunk) => ws.send(chunk));
    };

    ws.onclose = () => {
      this.ws = null;
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    };

    ws.onerror = () => {
      // onclose fires after onerror
    };

    this.ws = ws;
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;

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

export function createAudioWebSocket(sessionCode: string): IAudioWebSocket {
  return new AudioWebSocket(sessionCode);
}
