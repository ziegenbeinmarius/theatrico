import { useEffect, useRef, useState, useCallback } from 'react';
import { PositionUpdate, WsMessage } from '../types';

type Status = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

interface UseWebSocketResult {
  status: Status;
  lastPosition: PositionUpdate | null;
  lastPaused: boolean | null;
  send: (data: unknown) => void;
}

export function useWebSocket(sessionCode: string | undefined, path = 'ws'): UseWebSocketResult {
  const normalizedCode = sessionCode?.trim().toUpperCase();
  const [status, setStatus] = useState<Status>(normalizedCode ? 'connecting' : 'disconnected');
  const [lastPosition, setLastPosition] = useState<PositionUpdate | null>(null);
  const [lastPaused, setLastPaused] = useState<boolean | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmounted = useRef(false);

  const connect = useCallback(() => {
    if (!normalizedCode) {
      setStatus('disconnected');
      return;
    }
    if (unmounted.current) return;

    setStatus(s => (s === 'connected' ? 'connected' : 'connecting'));
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${window.location.host}/api/sessions/${normalizedCode}/${path}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!unmounted.current) setStatus('connected');
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data) as WsMessage;
        if (msg.type === 'position_update') setLastPosition(msg as PositionUpdate);
        if (msg.type === 'paused') setLastPaused((msg as { paused: boolean }).paused);
      } catch { /* ignore */ }
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
  }, [normalizedCode, path]);

  useEffect(() => {
    unmounted.current = false;
    setLastPosition(null);
    setLastPaused(null);
    connect();
    return () => {
      unmounted.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { status, lastPosition, lastPaused, send };
}
