import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Clapperboard, ExternalLink, Pause, Play, Radio, RefreshCw, StopCircle, Users,
} from 'lucide-react';
import { ScriptRenderer } from '../components/ScriptRenderer';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { useWebSocket } from '../hooks/useWebSocket';
import { useAnnotationsQuery, buildAnnotationMap } from '../hooks/useAnnotations';
import { useSessionQuery } from '../hooks/useSessions';
import { CueInfo, PositionUpdate, StatusMsg } from '../types';

interface AudioDevice {
  deviceId: string;
  label: string;
}

interface AudioErrorMessage {
  type: 'error';
  message?: string;
}

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
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError')
      return 'Microphone permission was denied. Allow microphone access and try again.';
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError')
      return 'No microphone was found on this device.';
    if (err.name === 'NotReadableError' || err.name === 'TrackStartError')
      return 'The selected microphone is already in use or could not be started.';
    if (err.name === 'OverconstrainedError')
      return 'The selected microphone is no longer available. Try the default microphone.';
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

export function OperatorSessionPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const sessionCode = (code ?? '').toUpperCase();

  const sessionQuery = useSessionQuery(sessionCode || undefined);
  const session = sessionQuery.data ?? null;

  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamStarting, setStreamStarting] = useState(false);
  const [transcripts, setTranscripts] = useState<string[]>([]);
  const [position, setPosition] = useState<PositionUpdate | null>(null);
  const [paused, setPaused] = useState(false);
  const [clients, setClients] = useState(0);
  const [streamError, setStreamError] = useState('');

  const displayScript = session?.script ?? null;
  const annotationScriptId = session?.script_id;

  // Annotations — display only; editing is via Script Library
  const annotationsQuery = useAnnotationsQuery(annotationScriptId);
  const annotationMap = buildAnnotationMap(annotationsQuery.data);

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
      if (context.state === 'suspended') await context.resume();
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
            if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'flush' }));
            voiceWasActiveRef.current = false;
          }
        }
      }, VOICE_ACTIVITY_POLL_MS);
    } catch {
      resetVoiceActivityGate();
    }
  }

  function resetVoiceActivityGate() {
    if (voiceMonitorRef.current !== null) window.clearInterval(voiceMonitorRef.current);
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
      if (initialAudioBlobRef.current !== blob) ws.send(initialAudioBlobRef.current);
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
        if (selectedDeviceId && err instanceof DOMException && (err.name === 'OverconstrainedError' || err.name === 'NotFoundError')) {
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
      ws.onerror = () => { setStreamError('Could not connect to the audio stream.'); stopStreaming(); };
      ws.onclose = () => { if (audioWsRef.current === ws) { setStreamError('Audio stream connection closed.'); stopStreaming(); } };
      recorder.onerror = () => { setStreamError('Recording failed. Try another microphone or browser.'); stopStreaming(); };
      ws.onopen = () => {
        recorder.ondataavailable = (e) => { sendGatedAudioBlob(e.data, ws); };
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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
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

  function handleLineClick(seqIdx: number) {
    sendControl({ type: 'force_position', line: seqIdx });
  }

  function togglePause() {
    const next = !paused;
    sendControl({ type: next ? 'pause' : 'resume' });
    setPaused(next);
  }

  if (sessionQuery.isLoading) {
    return (
      <main className="h-screen flex items-center justify-center bg-[#130f13]">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (sessionQuery.isError || !session) {
    return (
      <main className="h-screen flex flex-col items-center justify-center gap-4 bg-[#130f13]">
        <p className="text-sm text-destructive">Session not found or could not be loaded.</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/')}>Back to home</Button>
      </main>
    );
  }

  return (
    <main className="h-screen overflow-hidden flex flex-col bg-[radial-gradient(circle_at_top_left,rgba(143,29,44,0.25),transparent_32rem),linear-gradient(135deg,#130f13_0%,#211318_45%,#101716_100%)]">
      {/* Compact top toolbar */}
      <header className="shrink-0 border-b border-border bg-[#130f13]/90 backdrop-blur px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {/* Back */}
          <button
            onClick={() => { stopStreaming(); navigate('/'); }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mr-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>

          {/* Script title */}
          <div className="flex items-center gap-1.5 text-sm font-medium min-w-0">
            <Clapperboard className="w-3.5 h-3.5 text-secondary shrink-0" aria-hidden="true" />
            <span className="truncate max-w-[12rem]">{displayScript?.title ?? 'Session'}</span>
          </div>

          <span className="text-border hidden sm:block">|</span>

          {/* Join code + QR */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-secondary tracking-widest">{session.join_code}</span>
            <a
              href={`/qr/${session.join_code}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/30"
            >
              <ExternalLink className="w-2.5 h-2.5" />
              QR
            </a>
          </div>

          <span className="text-border hidden sm:block">|</span>

          <Badge variant="outline" className="gap-1 text-xs">
            <Users className="w-3 h-3" />
            {clients}
          </Badge>

          {position && (
            <span className="text-xs text-muted-foreground hidden md:block">
              Act {position.act + 1} · Sc {position.scene + 1} · L {position.line}
            </span>
          )}

          <div className="flex items-center gap-2 ml-auto">
            {!streaming && (
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                disabled={streamStarting}
                className="h-7 max-w-[10rem] px-2 py-0 text-xs border rounded border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 hidden sm:block"
              >
                {devices.length === 0 && <option value="">Default mic</option>}
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                ))}
              </select>
            )}

            {!streaming ? (
              <Button size="sm" onClick={startStreaming} disabled={streamStarting} className="h-7 gap-1.5 text-xs px-2.5">
                {streamStarting
                  ? <RefreshCw className="w-3 h-3 animate-spin" aria-hidden="true" />
                  : <Radio className="w-3 h-3" aria-hidden="true" />}
                {streamStarting ? 'Starting…' : 'Start mic'}
              </Button>
            ) : (
              <Button variant="destructive" size="sm" onClick={stopStreaming} className="h-7 gap-1.5 text-xs px-2.5">
                <StopCircle className="w-3 h-3" aria-hidden="true" />
                Stop mic
                <span className="relative flex w-1.5 h-1.5 ml-0.5">
                  <span className="absolute inline-flex w-full h-full bg-green-400 rounded-full opacity-75 animate-ping" />
                  <span className="relative inline-flex w-1.5 h-1.5 bg-green-400 rounded-full" />
                </span>
              </Button>
            )}

            <Button
              variant={paused ? 'secondary' : 'outline'}
              size="sm"
              onClick={togglePause}
              className="h-7 gap-1.5 text-xs px-2.5"
            >
              {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
              {paused ? 'Resume' : 'Pause'}
            </Button>
          </div>
        </div>

        {streamError && <p className="mt-1 text-xs text-destructive">{streamError}</p>}
      </header>

      {/* Active cue banners */}
      {activeCues.length > 0 && (
        <div className="shrink-0 border-b border-amber-500/20 bg-amber-950/30 px-3 py-1.5 space-y-1">
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
              <div key={cue.id} className="flex items-center gap-2 text-sm text-amber-300">
                <span className="shrink-0">{icon}</span>
                <span className="font-medium">CUE:</span>
                <span>{label}</span>
                <button
                  className="ml-auto shrink-0 text-amber-400/60 hover:text-amber-300 transition-colors px-1"
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

      {/* Script */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {displayScript ? (
          <ScriptRenderer
            script={displayScript}
            highlightedLine={position}
            fontSize="sm"
            onLineClick={handleLineClick}
            annotationMap={annotationScriptId ? annotationMap : undefined}
            showAnnotationsSplit
          />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Loading script…
          </div>
        )}
      </div>

      {/* Transcript strip */}
      <div className="shrink-0 border-t border-border bg-black/20 px-4 py-2">
        <p className="mb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Live transcript
        </p>
        <div className="overflow-y-auto max-h-[4.5rem] text-sm leading-relaxed text-muted-foreground">
          {transcripts.length === 0 ? (
            <span className="text-muted-foreground/60">Transcript appears here once mic is started…</span>
          ) : (
            transcripts.map((t, i) => <p key={i} className="mb-0.5">{t}</p>)
          )}
          <div ref={transcriptEndRef} />
        </div>
      </div>

    </main>
  );
}
