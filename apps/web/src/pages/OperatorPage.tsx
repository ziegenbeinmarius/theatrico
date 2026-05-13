import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Clapperboard, ExternalLink, Mic, PlusCircle, Radio, RefreshCw, ScrollText, StopCircle,
  Pause, Play, Users, Upload, Trash2,
} from 'lucide-react';
import type { Annotation } from '@theatrico/shared';
import { AnnotationModal } from '../components/AnnotationModal';
import { QRCodeDisplay } from '../components/QRCodeDisplay';
import { ScriptRenderer } from '../components/ScriptRenderer';
import { ScriptUploadModal } from '../components/ScriptUploadModal';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { useWebSocket } from '../hooks/useWebSocket';
import {
  useAnnotationsQuery,
  useCreateAnnotationMutation,
  useUpdateAnnotationMutation,
  useDeleteAnnotationMutation,
  buildAnnotationMap,
} from '../hooks/useAnnotations';
import {
  useCreateSessionMutation,
  useDeleteScriptMutation,
  useScriptsQuery,
  useScriptQuery,
  useSessionQuery,
} from "../hooks/useSessions";
import {
  CreateSessionResponse,
  CueInfo,
  PlayInfo,
  PositionUpdate,
  StatusMsg,
} from "../types";

interface AudioDevice {
  deviceId: string;
  label: string;
}

interface AudioErrorMessage {
  type: 'error';
  message?: string;
}

const LANGUAGES: { code: string; label: string }[] = [
  { code: '', label: 'Auto-detect' },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'German' },
  { code: 'fr', label: 'French' },
  { code: 'es', label: 'Spanish' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'ru', label: 'Russian' },
  { code: 'pl', label: 'Polish' },
  { code: 'sv', label: 'Swedish' },
  { code: 'no', label: 'Norwegian' },
  { code: 'da', label: 'Danish' },
  { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ko', label: 'Korean' },
  { code: 'ar', label: 'Arabic' },
];

const AUDIO_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

function supportedAudioMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  return AUDIO_MIME_CANDIDATES.find(type => MediaRecorder.isTypeSupported(type)) ?? '';
}

function audioWebSocketUrl(joinCode: string, mimeType: string) {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const url = new URL(`${proto}://${window.location.host}/api/sessions/${joinCode}/audio`);
  if (mimeType) url.searchParams.set('mime', mimeType);
  return url.toString();
}

function microphoneErrorMessage(err: unknown) {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
      return 'Microphone permission was denied. Allow microphone access and try again.';
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      return 'No microphone was found on this device.';
    }
    if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      return 'The selected microphone is already in use or could not be started.';
    }
    if (err.name === 'OverconstrainedError') {
      return 'The selected microphone is no longer available. Try the default microphone.';
    }
  }
  return err instanceof Error ? err.message : 'Could not access microphone.';
}
const VOICE_ACTIVITY_POLL_MS = 80;
const VOICE_ACTIVITY_HOLD_MS = 450;
const MIN_VOICE_RMS = 0.012;
const NOISE_FLOOR_MULTIPLIER = 2.5;

type WebAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};


export function OperatorPage() {
  const scriptsQuery = useScriptsQuery();
  const createSession = useCreateSessionMutation();
  const deleteScript = useDeleteScriptMutation();
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const sessionQuery = useSessionQuery(joinCode ?? undefined);
  const session = sessionQuery.data ?? null;

  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [selectedScript, setSelectedScript] = useState('');

  const scriptQuery = useScriptQuery(selectedScript || undefined);
  const [streaming, setStreaming] = useState(false);
  const [streamStarting, setStreamStarting] = useState(false);
  const [transcripts, setTranscripts] = useState<string[]>([]);
  const [position, setPosition] = useState<PositionUpdate | null>(null);
  const [paused, setPaused] = useState(false);
  const [clients, setClients] = useState(0);
  const [streamError, setStreamError] = useState('');

  const displayScript = session?.script ?? scriptQuery.data?.script ?? null;

  const annotationScriptId = selectedScript || undefined;
  const annotationsQuery = useAnnotationsQuery(annotationScriptId);
  const annotationMap = buildAnnotationMap(annotationsQuery.data);
  const createAnnotation = useCreateAnnotationMutation(annotationScriptId ?? '');
  const updateAnnotation = useUpdateAnnotationMutation(annotationScriptId ?? '');
  const deleteAnnotation = useDeleteAnnotationMutation(annotationScriptId ?? '');

  // Annotation modal state
  interface AnnotationTarget {
    seqIdx: number;
    lineLabel: string;
    annotations: Annotation[];
  }
  const [annotationTarget, setAnnotationTarget] = useState<AnnotationTarget | null>(null);

  // Cue overlay — shown when the live cursor hits a line with cue annotations
  const [activeCues, setActiveCues] = useState<CueInfo[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioWsRef = useRef<WebSocket | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const voiceMonitorRef = useRef<number | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioLevelDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const voiceGateReadyRef = useRef(false);
  const heardVoiceSinceLastBlobRef = useRef(false);
  const voiceWasActiveRef = useRef(false);
  const voiceActiveUntilRef = useRef(0);
  const noiseFloorRef = useRef(0.006);
  const sentInitialAudioRef = useRef(false);
  const initialAudioBlobRef = useRef<Blob | null>(null);

  const { send: sendOperator } = useWebSocket(session?.join_code, 'operator');
  const { lastPosition } = useWebSocket(session?.join_code, 'ws');

  useEffect(() => {
    if (lastPosition) {
      setPosition(lastPosition);
      setActiveCues(lastPosition.cues ?? []);
    }
  }, [lastPosition]);

  const operatorWsRef = useRef<WebSocket | null>(null);
  useEffect(() => {
    if (!session) return;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/api/sessions/${session.join_code}/operator`);
    operatorWsRef.current = ws;
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string);
        if (msg.type === 'status') {
          const s = msg as StatusMsg;
          setClients(s.clients);
          setPaused(s.paused);
        }
        if (msg.type === 'position_update') {
          const pos = msg as PositionUpdate;
          setPosition(pos);
          setActiveCues(pos.cues ?? []);
        }
      } catch { /* ignore */ }
    };
    return () => ws.close();
  }, [session]);

  const sendControl = useCallback((data: unknown) => {
    if (operatorWsRef.current?.readyState === WebSocket.OPEN) {
      operatorWsRef.current.send(JSON.stringify(data));
    } else {
      sendOperator(data);
    }
  }, [sendOperator]);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const inputs = all
        .filter(d => d.kind === 'audioinput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 6)}` }));
      setDevices(inputs);
      setSelectedDeviceId(current => current || inputs[0]?.deviceId || '');
    } catch { /* permissions not yet granted */ }
  }, []);

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    refreshDevices();
    navigator.mediaDevices.addEventListener?.('devicechange', refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refreshDevices);
  }, [refreshDevices]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [transcripts]);

  async function startVoiceActivityGate(stream: MediaStream) {
    resetVoiceActivityGate();
    const AudioContextCtor = window.AudioContext ?? (window as WebAudioWindow).webkitAudioContext;
    if (!AudioContextCtor) return;

    try {
      const context = new AudioContextCtor();
      if (context.state === 'suspended') {
        await context.resume();
      }
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);

      audioContextRef.current = context;
      mediaStreamSourceRef.current = source;
      analyserRef.current = analyser;
      audioLevelDataRef.current = new Uint8Array(analyser.fftSize);
      voiceGateReadyRef.current = true;
      noiseFloorRef.current = 0.006;

      voiceMonitorRef.current = window.setInterval(() => {
        const currentAnalyser = analyserRef.current;
        const data = audioLevelDataRef.current;
        if (!currentAnalyser || !data) return;

        currentAnalyser.getByteTimeDomainData(data);
        let sumSquares = 0;
        for (const value of data) {
          const centered = (value - 128) / 128;
          sumSquares += centered * centered;
        }
        const rms = Math.sqrt(sumSquares / data.length);
        const threshold = Math.max(MIN_VOICE_RMS, noiseFloorRef.current * NOISE_FLOOR_MULTIPLIER);
        const now = Date.now();

        if (rms >= threshold) {
          heardVoiceSinceLastBlobRef.current = true;
          voiceWasActiveRef.current = true;
          voiceActiveUntilRef.current = now + VOICE_ACTIVITY_HOLD_MS;
          return;
        }

        if (now > voiceActiveUntilRef.current) {
          noiseFloorRef.current = (noiseFloorRef.current * 0.95) + (rms * 0.05);
          if (voiceWasActiveRef.current) {
            const ws = audioWsRef.current;
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'flush' }));
            }
            voiceWasActiveRef.current = false;
          }
        }
      }, VOICE_ACTIVITY_POLL_MS);
    } catch {
      resetVoiceActivityGate();
    }
  }

  function resetVoiceActivityGate() {
    if (voiceMonitorRef.current !== null) {
      window.clearInterval(voiceMonitorRef.current);
    }
    voiceMonitorRef.current = null;
    mediaStreamSourceRef.current?.disconnect();
    mediaStreamSourceRef.current = null;
    analyserRef.current = null;
    audioLevelDataRef.current = null;
    voiceGateReadyRef.current = false;
    heardVoiceSinceLastBlobRef.current = false;
    voiceWasActiveRef.current = false;
    voiceActiveUntilRef.current = 0;
    noiseFloorRef.current = 0.006;
    sentInitialAudioRef.current = false;
    initialAudioBlobRef.current = null;
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
  }

  function shouldSendAudioBlob() {
    if (!voiceGateReadyRef.current) return true;
    const hasRecentVoice = heardVoiceSinceLastBlobRef.current || Date.now() < voiceActiveUntilRef.current;
    heardVoiceSinceLastBlobRef.current = false;
    return hasRecentVoice;
  }

  function sendGatedAudioBlob(blob: Blob, ws: WebSocket) {
    if (blob.size === 0 || ws.readyState !== WebSocket.OPEN) return;

    const sendNow = shouldSendAudioBlob();
    if (!sentInitialAudioRef.current) {
      if (!initialAudioBlobRef.current) initialAudioBlobRef.current = blob;
      if (!sendNow) return;

      if (initialAudioBlobRef.current !== blob) {
        ws.send(initialAudioBlobRef.current);
      }
      ws.send(blob);
      initialAudioBlobRef.current = null;
      sentInitialAudioRef.current = true;
      return;
    }

    if (sendNow) ws.send(blob);
  }

  async function startStreaming() {
    if (!session || streamStarting || streaming) return;
    setStreamError('');
    setStreamStarting(true);

    if (!window.isSecureContext) {
      setStreamError('Microphone access requires HTTPS. Open the deployed Fly app with an https:// URL.');
      setStreamStarting(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStreamError('Microphone access is not available in this browser.');
      setStreamStarting(false);
      return;
    }

    if (typeof MediaRecorder === 'undefined') {
      setStreamError('Audio recording is not supported in this browser.');
      setStreamStarting(false);
      return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
        });
      } catch (err) {
        if (
          selectedDeviceId &&
          err instanceof DOMException &&
          (err.name === 'OverconstrainedError' || err.name === 'NotFoundError')
        ) {
          setSelectedDeviceId('');
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } else {
          throw err;
        }
      }
      refreshDevices();
      await startVoiceActivityGate(stream);

      const mimeType = supportedAudioMimeType();

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      const ws = new WebSocket(audioWebSocketUrl(session.join_code, recorder.mimeType || mimeType));
      audioWsRef.current = ws;

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data as string);
          if (msg.type === 'transcript' && msg.text) setTranscripts(prev => [...prev, msg.text as string]);
          if (msg.type === 'error') {
            const audioError = msg as AudioErrorMessage;
            setStreamError(audioError.message || 'Audio transcription failed.');
          }
        } catch { /* ignore */ }
      };

      ws.onerror = () => {
        setStreamError('Could not connect to the audio stream. Check the deployed server and try again.');
        stopStreaming();
      };

      ws.onclose = () => {
        if (audioWsRef.current === ws) {
          setStreamError('Audio stream connection closed.');
          stopStreaming();
        }
      };

      recorder.onerror = () => {
        setStreamError('Recording failed. Try another microphone or browser.');
        stopStreaming();
      };

      ws.onopen = () => {
        recorder.ondataavailable = (e) => {
          sendGatedAudioBlob(e.data, ws);
        };
        try {
          recorder.start(250);
          setStreaming(true);
          setStreamStarting(false);
        } catch (err) {
          setStreamError(microphoneErrorMessage(err));
          stopStreaming();
        }
      };
    } catch (err) {
      stopStreaming();
      setStreamError(microphoneErrorMessage(err));
    }
  }

  function stopStreaming() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop());
    mediaRecorderRef.current = null;
    if (audioWsRef.current) {
      audioWsRef.current.onopen = null;
      audioWsRef.current.onmessage = null;
      audioWsRef.current.onerror = null;
      audioWsRef.current.onclose = null;
      audioWsRef.current.close();
    }
    resetVoiceActivityGate();
    audioWsRef.current?.close();
    audioWsRef.current = null;
    setStreamStarting(false);
    setStreaming(false);
  }

  function handleNewSession() {
    if (!selectedScript) return;
    stopStreaming();
    setTranscripts([]);
    setPosition(null);
    setPaused(false);
    setClients(0);
    setJoinCode(null);
    createSession.mutate(
      { language: selectedLanguage, scriptId: selectedScript },
      {
        onSuccess: (data: CreateSessionResponse) => {
          if (data && data.join_code) {
            setJoinCode(data.join_code);
          }
        },
      },
    );
  }

  function handleLineClick(seqIdx: number) {
    sendControl({ type: 'force_position', line: seqIdx });
  }

  function handleAnnotationClick(seqIdx: number, annotations: Annotation[]) {
    if (!displayScript || !annotationScriptId) return;
    // Build a label: "CHARACTER · first 50 chars of line text"
    let lineLabel = `Line ${seqIdx + 1}`;
    let idx = 0;
    outer: for (const act of displayScript.acts) {
      for (const scene of act.scenes) {
        for (const line of scene.lines) {
          if (idx === seqIdx) {
            const charPart = line.character ? `${line.character} · ` : '';
            lineLabel = `${charPart}${line.text.slice(0, 60)}${line.text.length > 60 ? '…' : ''}`;
            break outer;
          }
          idx++;
        }
      }
    }
    setAnnotationTarget({ seqIdx, lineLabel, annotations });
  }

  function handleAnnotationSave(type: string, content: string) {
    if (!annotationTarget || !annotationScriptId) return;
    const existing = annotationTarget.annotations[0] ?? null;
    if (existing) {
      updateAnnotation.mutate(
        { id: existing.id, type, content },
        { onSuccess: () => setAnnotationTarget(null) },
      );
    } else {
      createAnnotation.mutate(
        { lineIndex: annotationTarget.seqIdx, type, content },
        { onSuccess: () => setAnnotationTarget(null) },
      );
    }
  }

  function handleAnnotationDelete(id: number) {
    if (!annotationScriptId) return;
    deleteAnnotation.mutate(id, { onSuccess: () => setAnnotationTarget(null) });
  }

  function togglePause() {
    const next = !paused;
    sendControl({ type: next ? 'pause' : 'resume' });
    setPaused(next);
  }

  const totalScenes = displayScript?.acts.reduce(
    (total: number, act: import("../types").ScriptAct) => total + act.scenes.length,
    0,
  ) ?? 0;

  return (
    <main className="h-screen overflow-hidden flex flex-col bg-[radial-gradient(circle_at_top_left,rgba(143,29,44,0.25),transparent_32rem),linear-gradient(135deg,#130f13_0%,#211318_45%,#101716_100%)] px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-[90rem] flex flex-col gap-6 flex-1 min-h-0">
        {/* Header */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center justify-center rounded-md h-11 w-11 bg-secondary text-secondary-foreground">
            <Clapperboard className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-normal">
              Theatrico
            </h1>
            <p className="text-sm text-muted-foreground">Operator console</p>
          </div>
          {session && (
            <div className="flex items-center gap-2 ml-auto">
              <Badge variant="outline" className="gap-1.5">
                <Users className="w-3 h-3" />
                {clients} audience
              </Badge>
            </div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-[28rem_1fr] flex-1 min-h-0">
          {/* Left column */}
          <div className="flex flex-col gap-4 overflow-y-auto">
            {/* Session / QR card */}
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>Live session</CardTitle>
                    <CardDescription>
                      Create a join code for audience devices.
                    </CardDescription>
                  </div>
                  <Badge variant={session ? "secondary" : "muted"}>
                    {session ? "Active" : "Ready"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {session ? (
                  <>
                    <QRCodeDisplay joinCode={session.join_code} />
                    <a
                      href={`/qr/${session.join_code}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Open display view
                    </a>
                    {/* Compact script meta */}
                    {displayScript && (
                      <div className="px-3 py-2 space-y-1 text-xs rounded-md bg-black/20 text-muted-foreground">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <ScrollText className="w-3 h-3" />
                            {displayScript.title}
                          </span>
                          <span>
                            {displayScript.acts.length} acts · {totalScenes}{" "}
                            scenes
                          </span>
                        </div>
                        {session.language && (
                          <div className="text-xs">
                            Language:{" "}
                            <span className="text-foreground">
                              {LANGUAGES.find(
                                (l) => l.code === session.language,
                              )?.label ?? session.language}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <label className="text-sm text-muted-foreground">
                          Play <span className="text-destructive">*</span>
                        </label>
                        <button
                          onClick={() => setShowUploadModal(true)}
                          className="flex items-center gap-1 text-xs transition-colors text-muted-foreground hover:text-foreground"
                        >
                          <Upload className="w-3 h-3" />
                          Upload Script
                        </button>
                      </div>
                      <select
                        value={selectedScript}
                        onChange={(e) => setSelectedScript(e.target.value)}
                        className="w-full px-3 py-2 text-sm border rounded-md border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="" disabled>
                          Select a play…
                        </option>
                        {scriptsQuery.data
                          ?.filter((p: PlayInfo) => p.id !== "default")
                          .map((p: PlayInfo) => (
                            <option key={p.id} value={p.id}>
                              {p.title}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm text-muted-foreground">
                        Script language
                      </label>
                      <select
                        value={selectedLanguage}
                        onChange={(e) => setSelectedLanguage(e.target.value)}
                        className="w-full px-3 py-2 text-sm border rounded-md border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        {LANGUAGES.map((l) => (
                          <option key={l.code} value={l.code}>
                            {l.label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Sets the speech recognition language so Whisper doesn't
                        switch unexpectedly.
                      </p>
                    </div>
                    <Button
                      size="lg"
                      className="w-full"
                      onClick={handleNewSession}
                      disabled={createSession.isPending || !selectedScript}
                    >
                      {createSession.isPending ? (
                        <RefreshCw
                          className="w-5 h-5 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <PlusCircle className="w-5 h-5" aria-hidden="true" />
                      )}
                      New Session
                    </Button>
                  </div>
                )}
                {createSession.isError && (
                  <p className="text-sm text-destructive">
                    {createSession.error instanceof Error
                      ? createSession.error.message
                      : "Failed to create session."}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Script management */}
            {!session &&
              scriptsQuery.data &&
              scriptsQuery.data.filter((p: PlayInfo) => p.id !== "default")
                .length > 0 && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <ScrollText
                        className="w-5 h-5 text-secondary"
                        aria-hidden="true"
                      />
                      <CardTitle>Scripts</CardTitle>
                    </div>
                    <CardDescription>Manage uploaded scripts.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {scriptsQuery.data
                      .filter((p: PlayInfo) => p.id !== "default")
                      .map((p: PlayInfo) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between px-3 py-2 rounded-md bg-black/20"
                        >
                          <span className="text-sm truncate">{p.title}</span>
                          <button
                            onClick={() => {
                              if (confirm(`Delete "${p.title}"?`)) {
                                deleteScript.mutate(p.id, {
                                  onSuccess: () => {
                                    if (selectedScript === p.id)
                                      setSelectedScript("");
                                  },
                                });
                              }
                            }}
                            disabled={deleteScript.isPending}
                            className="ml-2 transition-colors shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-50"
                            title="Delete script"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    {deleteScript.isError && (
                      <p className="text-xs text-destructive">
                        {deleteScript.error instanceof Error
                          ? deleteScript.error.message
                          : "Delete failed."}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

            {/* Microphone / streaming */}
            {session && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Mic
                      className="w-5 h-5 text-secondary"
                      aria-hidden="true"
                    />
                    <CardTitle>Microphone</CardTitle>
                  </div>
                  <CardDescription>
                    Select input device and stream audio to Whisper.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    disabled={streaming || streamStarting}
                    className="w-full px-3 py-2 text-sm border rounded-md border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  >
                    {devices.length === 0 && (
                      <option value="">Default microphone</option>
                    )}
                    {devices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-3">
                    {!streaming ? (
                      <Button
                        onClick={startStreaming}
                        className="gap-2"
                        disabled={streamStarting}
                      >
                        {streamStarting ? (
                          <RefreshCw
                            className="w-4 h-4 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <Radio className="w-4 h-4" aria-hidden="true" />
                        )}
                        {streamStarting ? "Starting..." : "Start Streaming"}
                      </Button>
                    ) : (
                      <Button
                        variant="destructive"
                        onClick={stopStreaming}
                        className="gap-2"
                      >
                        <StopCircle className="w-4 h-4" aria-hidden="true" />
                        Stop Streaming
                      </Button>
                    )}
                    {streaming && (
                      <span className="flex items-center gap-1.5 text-sm text-green-400">
                        <span className="relative flex w-2 h-2">
                          <span className="absolute inline-flex w-full h-full bg-green-400 rounded-full opacity-75 animate-ping" />
                          <span className="relative inline-flex w-2 h-2 bg-green-400 rounded-full" />
                        </span>
                        Live
                      </span>
                    )}
                  </div>
                  {streamError && (
                    <p className="text-sm text-destructive">{streamError}</p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right column: transcript + script */}
          <div className="flex flex-col min-h-0 overflow-hidden">
            {displayScript && (
              <Card className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <CardHeader className="shrink-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <ScrollText
                        className="w-5 h-5 text-secondary"
                        aria-hidden="true"
                      />
                      <CardTitle>
                        {session ? "Click to Jump" : "Script Preview"}
                      </CardTitle>
                    </div>
                    {session && (
                      <Button
                        variant={paused ? "secondary" : "outline"}
                        size="sm"
                        onClick={togglePause}
                        className="gap-1.5 shrink-0"
                      >
                        {paused ? (
                          <>
                            <Play className="h-3.5 w-3.5" />
                            Resume Auto-Match
                          </>
                        ) : (
                          <>
                            <Pause className="h-3.5 w-3.5" />
                            Pause Auto-Match
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                  <CardDescription className="text-xs">
                    {session
                      ? "Click a line to force the cursor there."
                      : "Start a session to enable cursor control."}
                    {position && (
                      <span className="ml-2 text-muted-foreground">
                        · Act {position.act + 1} · Scene {position.scene + 1} ·
                        Line {position.line}
                      </span>
                    )}
                  </CardDescription>
                </CardHeader>

                {/* Transcript strip — visible only when a session is active */}
                {session && (
                  <div className="px-4 pb-3 border-b shrink-0 border-border">
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Live transcript
                    </p>
                    <div className="px-3 py-2 overflow-y-auto text-sm leading-relaxed rounded-md max-h-24 bg-black/30">
                      {transcripts.length === 0 ? (
                        <span className="text-muted-foreground">
                          Transcript will appear here once streaming starts…
                        </span>
                      ) : (
                        transcripts.map((t, i) => (
                          <p key={i} className="mb-0.5">
                            {t}
                          </p>
                        ))
                      )}
                      <div ref={transcriptEndRef} />
                    </div>
                  </div>
                )}

                {/* Cue banner — visible during a live session when cursor lands on a cued line */}
                {session && activeCues.length > 0 && (
                  <div className="mx-4 mb-3 shrink-0 space-y-1.5">
                    {activeCues.map((cue) => {
                      let label = cue.content;
                      let icon = '⚡';
                      try {
                        const parsed = JSON.parse(cue.content) as { cue_type: string; description: string };
                        const icons: Record<string, string> = { lighting: '💡', sound: '🔊', stage_direction: '🎭', custom: '⚡' };
                        icon = icons[parsed.cue_type] ?? '⚡';
                        label = parsed.description;
                      } catch { /* raw string */ }
                      return (
                        <div
                          key={cue.id}
                          className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300"
                        >
                          <span className="shrink-0 text-base leading-5">{icon}</span>
                          <span>{label}</span>
                          <button
                            className="ml-auto shrink-0 text-amber-400/60 hover:text-amber-300 transition-colors"
                            onClick={() => setActiveCues((prev) => prev.filter((c) => c.id !== cue.id))}
                            title="Dismiss"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <CardContent className="flex-1 min-h-0 p-0 overflow-y-auto">
                  <ScriptRenderer
                    script={displayScript}
                    highlightedLine={position}
                    fontSize="sm"
                    onLineClick={session ? handleLineClick : undefined}
                    annotationMap={annotationScriptId ? annotationMap : undefined}
                    onAnnotationClick={annotationScriptId ? handleAnnotationClick : undefined}
                  />
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
      {showUploadModal && (
        <ScriptUploadModal
          onClose={() => setShowUploadModal(false)}
          onUploaded={(id) => {
            setShowUploadModal(false);
            setSelectedScript(id);
          }}
        />
      )}
      {annotationTarget && annotationScriptId && (
        <AnnotationModal
          annotation={annotationTarget.annotations[0] ?? null}
          lineIndex={annotationTarget.seqIdx}
          lineLabel={annotationTarget.lineLabel}
          onSave={(type, content) => handleAnnotationSave(type, content)}
          onDelete={annotationTarget.annotations[0] ? handleAnnotationDelete : undefined}
          onClose={() => setAnnotationTarget(null)}
          isPending={createAnnotation.isPending || updateAnnotation.isPending || deleteAnnotation.isPending}
        />
      )}
    </main>
  );
}
