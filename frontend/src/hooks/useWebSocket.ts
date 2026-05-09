import { useEffect, useRef, useState, useCallback } from 'react';
import { PositionUpdate } from '../types';

type Status = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

interface UseWebSocketResult {
  status: Status;
  lastPosition: PositionUpdate | null;
}

export function useWebSocket(sessionCode: string | undefined): UseWebSocketResult {
  const normalizedCode = sessionCode?.trim().toUpperCase();
  const [status, setStatus] = useState<Status>(normalizedCode ? 'connecting' : 'disconnected');
  const [lastPosition, setLastPosition] = useState<PositionUpdate | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmounted = useRef(false);

  const connect = useCallback(() => {
    if (!normalizedCode) {
      setStatus('disconnected');
      return;
    }
    if (unmounted.current) return;

    setStatus(status => (status === 'connected' ? 'connected' : 'connecting'));
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${window.location.host}/api/sessions/${normalizedCode}/ws`;
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
  }, [normalizedCode]);

  useEffect(() => {
    unmounted.current = false;
    setLastPosition(null);
    connect();
    return () => {
      unmounted.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { status, lastPosition };
}
