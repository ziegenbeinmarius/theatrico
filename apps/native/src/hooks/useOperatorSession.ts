import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { theatricoClient } from '@/services/api/theatricoClient';
import { createSessionWebSocket } from '@/services/api/websocket/SessionWebSocket';
import { createOperatorWebSocket, type OperatorWebSocket } from '@/services/api/websocket/OperatorWebSocket';
import { useSpeechRecognizerContext } from '@/context/SpeechRecognizerContext';
import type {
  ISessionWebSocket,
  Play,
  Position,
  Session,
  SessionMessage,
} from '@/domain';
import { flattenLines, findLineIndex } from '@/lib/scriptUtils';
import { matchTranscriptToScript, buildContextHint } from '@/lib/scriptMatcher';

export type WsStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface TranscriptItem {
  id: string;
  text: string;
  isFinal: boolean;
  timestamp: number;
}

export interface UseOperatorSessionResult {
  session: Session | undefined;
  play: Play | null;
  isLoading: boolean;
  isRecording: boolean;
  transcriptItems: TranscriptItem[];
  currentPosition: Position | null;
  wsStatus: WsStatus;
  error: Error | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  togglePause: () => Promise<void>;
  movePrev: () => Promise<void>;
  moveNext: () => Promise<void>;
}

export function useOperatorSession(sessionCode: string): UseOperatorSessionResult {
  const { recognizer } = useSpeechRecognizerContext();

  const {
    data: session,
    isLoading: sessionLoading,
    error: sessionError,
  } = useQuery({
    queryKey: ['sessions', sessionCode],
    queryFn: () => theatricoClient.getSession(sessionCode),
    enabled: Boolean(sessionCode),
  });

  const play = session?.play ?? null;
  const isLoading = sessionLoading;
  const error = sessionError instanceof Error ? sessionError : null;

  const [isRecording, setIsRecording] = useState(false);
  const [transcriptItems, setTranscriptItems] = useState<TranscriptItem[]>([]);
  const [currentPosition, setCurrentPosition] = useState<Position | null>(null);
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting');

  // Only sync initial position from session on first load (lineId string guards against refetch resets)
  useEffect(() => {
    if (session?.currentPosition) {
      setCurrentPosition(session.currentPosition);
    }
  }, [session?.currentPosition?.lineId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sessionWsRef = useRef<ISessionWebSocket | null>(null);
  const operatorWsRef = useRef<OperatorWebSocket | null>(null);
  const transcriptCounterRef = useRef(0);

  // Refs so callbacks always see the latest values without stale closures
  const flatLinesRef = useRef<ReturnType<typeof flattenLines>>([]);
  const currentPositionRef = useRef<Position | null>(currentPosition);

  useEffect(() => { currentPositionRef.current = currentPosition; }, [currentPosition]);
  useEffect(() => {
    flatLinesRef.current = play ? flattenLines(play) : [];
  }, [play]);

  // Session + operator WebSocket connections
  useEffect(() => {
    if (!sessionCode) return;

    const sessionWs = createSessionWebSocket(sessionCode);
    const operatorWs = createOperatorWebSocket(sessionCode);
    sessionWsRef.current = sessionWs;
    operatorWsRef.current = operatorWs;

    setWsStatus('connecting');

    const handleOpen = () => setWsStatus('connected');
    const handleClose = () => setWsStatus('reconnecting');
    const handleGiveUp = () => setWsStatus('disconnected');

    const handleMessage = (msg: SessionMessage) => {
      if (msg.type === 'position_update') {
        // Backend sends { type, line: seqIdx } — convert to our Position type
        if (typeof msg.line === 'number') {
          const matched = flatLinesRef.current[msg.line];
          if (matched) setCurrentPosition(matched.position);
        } else if (msg.position) {
          setCurrentPosition(msg.position);
        }
      } else if (msg.type === 'transcript') {
        const id = String(++transcriptCounterRef.current);
        setTranscriptItems((prev) => {
          const lastItem = prev[prev.length - 1];
          const next = (() => {
            if (!msg.isFinal && lastItem && !lastItem.isFinal) {
              return [...prev.slice(0, -1), { id, text: msg.text, isFinal: false, timestamp: Date.now() }];
            }
            return [...prev, { id, text: msg.text, isFinal: msg.isFinal, timestamp: Date.now() }];
          })();
          return next.length > 5 ? next.slice(-5) : next;
        });
      } else if (msg.type === 'error') {
        setWsStatus('disconnected');
      }
    };

    sessionWs.onMessage(handleMessage);
    sessionWs.onOpen(handleOpen);
    sessionWs.onClose(handleClose);
    sessionWs.onGiveUp(handleGiveUp);
    sessionWs.connect();
    operatorWs.connect();

    return () => {
      sessionWs.offMessage(handleMessage);
      sessionWs.offOpen(handleOpen);
      sessionWs.offClose(handleClose);
      sessionWs.offGiveUp(handleGiveUp);
      sessionWs.disconnect();
      operatorWs.disconnect();
      sessionWsRef.current = null;
      operatorWsRef.current = null;
    };
  }, [sessionCode]);

  // Local transcription → match against script → advance position
  useEffect(() => {
    const unsub = recognizer.onResult((result) => {
      const id = String(++transcriptCounterRef.current);
      setTranscriptItems((prev) => {
        const lastItem = prev[prev.length - 1];
        const next = (() => {
          if (!result.isFinal && lastItem && !lastItem.isFinal) {
            return [...prev.slice(0, -1), { id, text: result.text, isFinal: false, timestamp: Date.now() }];
          }
          return [...prev, { id, text: result.text, isFinal: result.isFinal, timestamp: Date.now() }];
        })();
        return next.length > 5 ? next.slice(-5) : next;
      });

      // WhisperRecognizer keeps isFinal=false throughout the session (isCapturing stays true),
      // so match on every result. Guard by matchIdx > currentIdx to only advance forward
      // and skip re-firing on the same line during rolling interim updates.
      const lines = flatLinesRef.current;
      const currentIdx = currentPositionRef.current
        ? findLineIndex(lines, currentPositionRef.current.lineId)
        : -1;
      const matchIdx = matchTranscriptToScript(result.text, lines, Math.max(0, currentIdx));
      if (matchIdx >= 0 && matchIdx > currentIdx) {
        const matched = lines[matchIdx];
        if (matched) {
          currentPositionRef.current = matched.position; // update immediately to block duplicate fires
          setCurrentPosition(matched.position);
          operatorWsRef.current?.forcePosition(matchIdx);
        }
      }
    });
    return unsub;
  }, [recognizer]);

  const startRecording = useCallback(async () => {
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) throw new Error('Microphone permission denied');

    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

    const lines = flatLinesRef.current;
    const currentIdx = currentPositionRef.current
      ? findLineIndex(lines, currentPositionRef.current.lineId)
      : 0;
    const contextHint = buildContextHint(lines, currentIdx, 4);

    await recognizer.start({ language: 'en', contextHint });
    setIsRecording(true);
  }, [recognizer]);

  const stopRecording = useCallback(async () => {
    setIsRecording(false);
    try {
      await recognizer.stop();
    } catch {}
  }, [recognizer]);

  const togglePause = useCallback(async () => {
    if (!session) return;
    if (session.status === 'paused') {
      operatorWsRef.current?.resume();
    } else {
      operatorWsRef.current?.pause();
    }
  }, [session]);

  const movePrev = useCallback(async () => {
    if (!currentPosition) return;
    const lines = flatLinesRef.current;
    const idx = findLineIndex(lines, currentPosition.lineId);
    if (idx <= 0) return;
    const prevLine = lines[idx - 1];
    if (!prevLine) return;
    setCurrentPosition(prevLine.position);
    operatorWsRef.current?.forcePosition(idx - 1);
  }, [currentPosition]);

  const moveNext = useCallback(async () => {
    if (!currentPosition) return;
    const lines = flatLinesRef.current;
    const idx = findLineIndex(lines, currentPosition.lineId);
    if (idx < 0 || idx >= lines.length - 1) return;
    const nextLine = lines[idx + 1];
    if (!nextLine) return;
    setCurrentPosition(nextLine.position);
    operatorWsRef.current?.forcePosition(idx + 1);
  }, [currentPosition]);

  return {
    session,
    play,
    isLoading,
    isRecording,
    transcriptItems,
    currentPosition,
    wsStatus,
    error,
    startRecording,
    stopRecording,
    togglePause,
    movePrev,
    moveNext,
  };
}
