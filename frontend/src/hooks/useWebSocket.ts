import { useEffect, useRef, useState, useCallback } from 'react';
import { PositionUpdate } from '../types';

type Status = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

interface UseWebSocketResult {
  status: Status;
  lastPosition: PositionUpdate | null;
}

export function useWebSocket(sessionCode: string): UseWebSocketResult {
  const [status, setStatus] = useState<Status>('connecting');
  const [lastPosition, setLastPosition] = useState<PositionUpdate | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmounted = useRef(false);

  const connect = useCallback(() => {
    if (unmounted.current) return;

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${window.location.host}/api/sessions/${sessionCode}/ws`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!unmounted.current) setStatus('connected');
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data) as PositionUpdate;
        if (msg.type === 'position_update') {
          setLastPosition(msg);
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (unmounted.current) return;
      setStatus('reconnecting');
      reconnectTimer.current = setTimeout(() => {
        if (!unmounted.current) connect();
      }, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [sessionCode]);

  useEffect(() => {
    unmounted.current = false;
    connect();
    return () => {
      unmounted.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { status, lastPosition };
}
