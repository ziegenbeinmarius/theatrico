import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { theatricoClient } from '@/services/api/theatricoClient';
import { SessionWebSocket } from '@/services/api/websocket/SessionWebSocket';
import type { Play, Position, Session, SessionMessage } from '@/domain';
import { flattenLines, type FlatLine } from '@/lib/scriptUtils';

export type WsStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface UseAudienceSessionResult {
  session: Session | undefined;
  play: Play | null;
  flatLines: FlatLine[];
  isLoading: boolean;
  currentPosition: Position | null;
  wsStatus: WsStatus;
  error: Error | null;
}

export function useAudienceSession(sessionCode: string): UseAudienceSessionResult {
  const {
    data: session,
    isLoading: sessionLoading,
    error: sessionError,
  } = useQuery({
    queryKey: ['sessions', sessionCode],
    queryFn: () => theatricoClient.getSession(sessionCode),
    enabled: Boolean(sessionCode),
  });

  // getSession returns the full play embedded in session.play — use it directly
  // rather than fetching the slim play list (which lacks acts/scenes/lines).
  const play = session?.play ?? null;
  const flatLines = play ? flattenLines(play) : [];
  const isLoading = sessionLoading;
  const error = sessionError instanceof Error ? sessionError : null;

  const [currentPosition, setCurrentPosition] = useState<Position | null>(null);
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting');

  useEffect(() => {
    if (session?.currentPosition) {
      setCurrentPosition(session.currentPosition);
    }
  }, [session?.currentPosition]);

  const sessionWsRef = useRef<SessionWebSocket | null>(null);

  useEffect(() => {
    if (!sessionCode) return;

    setWsStatus('connecting');
    const sessionWs = new SessionWebSocket(sessionCode);
    sessionWsRef.current = sessionWs;

    const handleMessage = (msg: SessionMessage) => {
      if (msg.type === 'position_update') {
        if (msg.position) setCurrentPosition(msg.position);
      } else if (msg.type === 'error') {
        setWsStatus('disconnected');
      }
    };
    const handleOpen = () => setWsStatus('connected');
    const handleClose = () => setWsStatus('reconnecting');
    const handleGiveUp = () => setWsStatus('disconnected');

    sessionWs.onMessage(handleMessage);
    sessionWs.onOpen(handleOpen);
    sessionWs.onClose(handleClose);
    sessionWs.onGiveUp(handleGiveUp);
    sessionWs.connect();

    return () => {
      sessionWs.offMessage(handleMessage);
      sessionWs.offOpen(handleOpen);
      sessionWs.offClose(handleClose);
      sessionWs.offGiveUp(handleGiveUp);
      sessionWs.disconnect();
      sessionWsRef.current = null;
    };
  }, [sessionCode]);

  return {
    session,
    play,
    flatLines,
    isLoading,
    currentPosition,
    wsStatus,
    error,
  };
}
