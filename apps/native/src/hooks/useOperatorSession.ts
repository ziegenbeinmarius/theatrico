import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { theatricoClient } from '@/services/api/theatricoClient';
import { createSessionWebSocket } from '@/services/api/websocket/SessionWebSocket';
import { createOperatorWebSocket, type OperatorWebSocket } from '@/services/api/websocket/OperatorWebSocket';
import { useSpeechRecognizerContext } from '@/context/SpeechRecognizerContext';
import { useSettings } from '@/context/SettingsContext';
import type {
  ISessionWebSocket,
  Play,
  Position,
  Session,
  SessionMessage,
  WsCueInfo,
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
  activeCues: WsCueInfo[];
  dismissCue: (id: number) => void;
  wsStatus: WsStatus;
  error: Error | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  togglePause: () => Promise<void>;
  movePrev: () => Promise<void>;
  moveNext: () => Promise<void>;
}

const MAX_MATCH_ADVANCE_LINES = 7;

export function useOperatorSession(sessionCode: string): UseOperatorSessionResult {
  const { recognizer } = useSpeechRecognizerContext();
  const { settings } = useSettings();

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
  const [activeCues, setActiveCues] = useState<WsCueInfo[]>([]);
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
  const lastAcceptedTranscriptRef = useRef<{ normalized: string; at: number }>({
    normalized: '',
    at: 0,
  });

  // Refs so callbacks always see the latest values without stale closures
  const flatLinesRef = useRef<ReturnType<typeof flattenLines>>([]);
  const currentPositionRef = useRef<Position | null>(currentPosition);

  useEffect(() => { currentPositionRef.current = currentPosition; }, [currentPosition]);
  useEffect(() => {
    flatLinesRef.current = play ? flattenLines(play) : [];
  }, [play]);

  const normalizeTranscript = useCallback((text: string) => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }, []);

  const isHallucinatedTranscript = useCallback(
    (text: string) => {
      const normalized = normalizeTranscript(text);
      if (!normalized) return true;
      // Common non-script hallucinations from mobile recognizers/whisper.
      if (
        normalized === 'end playback' ||
        normalized === 'playback' ||
        normalized === 'thank you for watching' ||
        normalized === 'thanks for watching'
      ) {
        return true;
      }
      const words = normalized.split(' ').filter(Boolean).length;
      if (words <= 1 && normalized.length < 4) {
        return true;
      }
      return false;
    },
    [normalizeTranscript],
  );

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
        setActiveCues(msg.cues ?? []);
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
      if (isHallucinatedTranscript(result.text)) {
        return;
      }

      const id = String(++transcriptCounterRef.current);
      setTranscriptItems((prev) => {
        const lastItem = prev[prev.length - 1];
        const next = (() => {
          if (!result.isFinal && lastItem && !lastItem.isFinal) {
            return [
              ...prev.slice(0, -1),
              { id, text: result.text, isFinal: false, timestamp: Date.now() },
            ];
          }
          return [
            ...prev,
            { id, text: result.text, isFinal: result.isFinal, timestamp: Date.now() },
          ];
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

      const normalized = normalizeTranscript(result.text);
      const now = Date.now();
      if (
        normalized === lastAcceptedTranscriptRef.current.normalized &&
        now - lastAcceptedTranscriptRef.current.at < 1200
      ) {
        return;
      }

      const words = normalized.split(' ').filter(Boolean).length;
      const shouldAttemptMatch = result.isFinal || words >= 4 || normalized.length >= 24;
      if (!shouldAttemptMatch) {
        return;
      }

      const threshold = result.isFinal ? 0.46 : 0.58;
      const windowSize = result.isFinal ? 14 : 10;
      const matchIdx = matchTranscriptToScript(
        result.text,
        lines,
        Math.max(0, currentIdx),
        windowSize,
        threshold,
      );
      if (
        matchIdx >= 0 &&
        matchIdx > currentIdx &&
        matchIdx - currentIdx <= MAX_MATCH_ADVANCE_LINES
      ) {
        const matched = lines[matchIdx];
        if (matched) {
          lastAcceptedTranscriptRef.current = { normalized, at: now };
          currentPositionRef.current = matched.position; // update immediately to block duplicate fires
          setCurrentPosition(matched.position);
          operatorWsRef.current?.forcePosition(matchIdx);
        }
      }
    });
    return unsub;
  }, [isHallucinatedTranscript, normalizeTranscript, recognizer]);

  const startRecording = useCallback(async () => {
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) throw new Error('Microphone permission denied');

    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

    const lines = flatLinesRef.current;
    const currentIdx = currentPositionRef.current
      ? findLineIndex(lines, currentPositionRef.current.lineId)
      : 0;
    const contextHint = buildContextHint(lines, currentIdx, 10);

    await recognizer.start({ language: settings.language, contextHint });
    setIsRecording(true);
  }, [recognizer, settings.language]);

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

  const dismissCue = useCallback((id: number) => {
    setActiveCues((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return {
    session,
    play,
    isLoading,
    isRecording,
    transcriptItems,
    currentPosition,
    activeCues,
    dismissCue,
    wsStatus,
    error,
    startRecording,
    stopRecording,
    togglePause,
    movePrev,
    moveNext,
  };
}
