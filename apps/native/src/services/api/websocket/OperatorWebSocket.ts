import { config } from '@/lib/config';

export class OperatorWebSocket {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private shouldConnect = false;

  constructor(sessionCode: string) {
    const wsBase = config.backendUrl.replace(/^http/, 'ws');
    this.url = `${wsBase}/api/sessions/${encodeURIComponent(sessionCode)}/operator`;
  }

  connect(): void {
    this.shouldConnect = true;
    this.openSocket();
  }

  disconnect(): void {
    this.shouldConnect = false;
    this.ws?.close();
    this.ws = null;
  }

  forcePosition(seqIdx: number): void {
    this.sendJSON({ type: 'force_position', line: seqIdx });
  }

  pause(): void {
    this.sendJSON({ type: 'pause' });
  }

  resume(): void {
    this.sendJSON({ type: 'resume' });
  }

  private sendJSON(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private openSocket(): void {
    const ws = new WebSocket(this.url);
    ws.onopen = () => {};
    ws.onclose = () => {
      this.ws = null;
    };
    ws.onerror = () => {};
    this.ws = ws;
  }
}

export function createOperatorWebSocket(sessionCode: string): OperatorWebSocket {
  return new OperatorWebSocket(sessionCode);
}
