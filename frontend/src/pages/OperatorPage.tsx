import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Clapperboard, Mic, PlusCircle, Radio, RefreshCw, ScrollText, StopCircle,
  Pause, Play, Users, MousePointerClick,
} from 'lucide-react';
import { QRCodeDisplay } from '../components/QRCodeDisplay';
import { ScriptRenderer } from '../components/ScriptRenderer';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { useWebSocket } from '../hooks/useWebSocket';
import { useCreateSessionMutation, useScriptQuery } from '../hooks/useSessions';
import { PositionUpdate, StatusMsg } from '../types';

interface AudioDevice {
  deviceId: string;
  label: string;
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

export function OperatorPage() {
  const scriptQuery = useScriptQuery();
  const createSession = useCreateSessionMutation();
  const session = createSession.data;

  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [transcripts, setTranscripts] = useState<string[]>([]);
  const [position, setPosition] = useState<PositionUpdate | null>(null);
  const [paused, setPaused] = useState(false);
  const [clients, setClients] = useState(0);
  const [streamError, setStreamError] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioWsRef = useRef<WebSocket | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Operator control websocket (Sprint 4)
  const { send: sendOperator } = useWebSocket(session?.join_code, 'operator');

  // Also watch the audience WS for position updates
  const { lastPosition } = useWebSocket(session?.join_code, 'ws');

  // Merge position from either WS (operator ws echoes positions too)
  useEffect(() => {
    if (lastPosition) setPosition(lastPosition);
  }, [lastPosition]);

  // Handle status messages from operator WS
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
        if (msg.type === 'position_update') setPosition(msg as PositionUpdate);
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
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const inputs = all
        .filter(d => d.kind === 'audioinput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 6)}` }));
      setDevices(inputs);
      if (inputs.length > 0 && !selectedDeviceId) setSelectedDeviceId(inputs[0].deviceId);
    } catch { /* permissions not yet granted */ }
  }, [selectedDeviceId]);

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
  }, [refreshDevices]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [transcripts]);

  async function startStreaming() {
    if (!session) return;
    setStreamError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
      });
      refreshDevices();

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${window.location.host}/api/sessions/${session.join_code}/audio`);
      audioWsRef.current = ws;

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data as string);
          if (msg.type === 'transcript' && msg.text) setTranscripts(prev => [...prev, msg.text as string]);
        } catch { /* ignore */ }
      };
      ws.onerror = () => stopStreaming();

      ws.onopen = () => {
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(e.data);
        };
        recorder.start(250);
        setStreaming(true);
      };
    } catch (err) {
      setStreamError(err instanceof Error ? err.message : 'Could not access microphone.');
    }
  }

  function stopStreaming() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop());
    mediaRecorderRef.current = null;
    audioWsRef.current?.close();
    audioWsRef.current = null;
    setStreaming(false);
  }

  function handleNewSession() {
    stopStreaming();
    setTranscripts([]);
    setPosition(null);
    setPaused(false);
    setClients(0);
    createSession.mutate(selectedLanguage);
  }

  function handleLineClick(seqIdx: number) {
    sendControl({ type: 'force_position', line: seqIdx });
  }

  function togglePause() {
    const next = !paused;
    sendControl({ type: next ? 'pause' : 'resume' });
    setPaused(next);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(143,29,44,0.25),transparent_32rem),linear-gradient(135deg,#130f13_0%,#211318_45%,#101716_100%)] px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
            <Clapperboard className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-normal">Theatrico</h1>
            <p className="text-sm text-muted-foreground">Operator console</p>
          </div>
          {session && (
            <div className="ml-auto flex items-center gap-2">
              <Badge variant="outline" className="gap-1.5">
                <Users className="h-3 w-3" />
                {clients} audience
              </Badge>
            </div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
          {/* Main column */}
          <div className="space-y-6">
            {/* Session card */}
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>Live session</CardTitle>
                    <CardDescription>Create a join code for audience devices.</CardDescription>
                  </div>
                  <Badge variant={session ? 'secondary' : 'muted'}>{session ? 'Active' : 'Ready'}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {session ? (
                  <>
                    <QRCodeDisplay joinCode={session.join_code} url={session.qr_url} />
                    {session.language && (
                      <p className="text-sm text-muted-foreground">
                        Language: <span className="font-medium text-foreground">{LANGUAGES.find(l => l.code === session.language)?.label ?? session.language}</span>
                      </p>
                    )}
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1.5 block text-sm text-muted-foreground">Language for next session</label>
                        <select
                          value={selectedLanguage}
                          onChange={e => setSelectedLanguage(e.target.value)}
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                        </select>
                      </div>
                      <Button className="w-full" variant="outline" onClick={handleNewSession} disabled={createSession.isPending}>
                        {createSession.isPending
                          ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                          : <PlusCircle className="h-4 w-4" aria-hidden="true" />}
                        New Session
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1.5 block text-sm text-muted-foreground">Script language</label>
                      <select
                        value={selectedLanguage}
                        onChange={e => setSelectedLanguage(e.target.value)}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                      </select>
                      <p className="mt-1 text-xs text-muted-foreground">Sets the speech recognition language so Whisper doesn't switch unexpectedly.</p>
                    </div>
                    <Button size="lg" className="w-full" onClick={handleNewSession} disabled={createSession.isPending}>
                      {createSession.isPending
                        ? <RefreshCw className="h-5 w-5 animate-spin" aria-hidden="true" />
                        : <PlusCircle className="h-5 w-5" aria-hidden="true" />}
                      New Session
                    </Button>
                  </div>
                )}
                {createSession.isError && (
                  <p className="text-sm text-destructive">
                    {createSession.error instanceof Error ? createSession.error.message : 'Failed to create session.'}
                  </p>
                )}
              </CardContent>
            </Card>

            {session && (
              <>
                {/* Matcher controls */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <MousePointerClick className="h-5 w-5 text-secondary" aria-hidden="true" />
                      <CardTitle>Matcher Controls</CardTitle>
                    </div>
                    <CardDescription>
                      Click any script line to force-jump the cursor. Pause auto-matching to take manual control.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button
                      variant={paused ? 'secondary' : 'outline'}
                      onClick={togglePause}
                      className="gap-2"
                    >
                      {paused
                        ? <><Play className="h-4 w-4" />Resume Auto-Match</>
                        : <><Pause className="h-4 w-4" />Pause Auto-Match</>}
                    </Button>
                    {position && (
                      <p className="text-sm text-muted-foreground">
                        Current: Act {position.act + 1} · Scene {position.scene + 1} · Line {position.line}
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Microphone / streaming */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Mic className="h-5 w-5 text-secondary" aria-hidden="true" />
                      <CardTitle>Microphone</CardTitle>
                    </div>
                    <CardDescription>Select input device and stream audio to Whisper.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <select
                      value={selectedDeviceId}
                      onChange={e => setSelectedDeviceId(e.target.value)}
                      disabled={streaming}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                    >
                      {devices.length === 0 && <option value="">Default microphone</option>}
                      {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                    </select>
                    <div className="flex items-center gap-3">
                      {!streaming ? (
                        <Button onClick={startStreaming} className="gap-2">
                          <Radio className="h-4 w-4" aria-hidden="true" />
                          Start Streaming
                        </Button>
                      ) : (
                        <Button variant="destructive" onClick={stopStreaming} className="gap-2">
                          <StopCircle className="h-4 w-4" aria-hidden="true" />
                          Stop Streaming
                        </Button>
                      )}
                      {streaming && (
                        <span className="flex items-center gap-1.5 text-sm text-green-400">
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
                          </span>
                          Live
                        </span>
                      )}
                    </div>
                    {streamError && <p className="text-sm text-destructive">{streamError}</p>}
                  </CardContent>
                </Card>

                {/* Live transcript */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Live Transcript</CardTitle>
                    {position && (
                      <CardDescription>
                        Act {position.act + 1} · Scene {position.scene + 1} · Line {position.line}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-52 overflow-y-auto rounded-md bg-black/30 p-3 text-sm leading-relaxed">
                      {transcripts.length === 0 ? (
                        <span className="text-muted-foreground">Transcript will appear here once streaming starts…</span>
                      ) : (
                        transcripts.map((t, i) => <p key={i} className="mb-1">{t}</p>)
                      )}
                      <div ref={transcriptEndRef} />
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          {/* Right column: script summary + script view for click-to-jump */}
          <div className="space-y-6">
            <Card className="self-start">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <ScrollText className="h-5 w-5 text-secondary" aria-hidden="true" />
                  <CardTitle className="text-lg">Script</CardTitle>
                </div>
                <CardDescription>Default script loaded from the backend parser.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {scriptQuery.isLoading && <p className="text-muted-foreground">Loading script...</p>}
                {scriptQuery.isError && <p className="text-destructive">Script could not be loaded.</p>}
                {scriptQuery.data && (
                  <>
                    <div className="flex items-center justify-between border-b border-border pb-3">
                      <span className="text-muted-foreground">Title</span>
                      <span className="font-medium">{scriptQuery.data.title}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-border pb-3">
                      <span className="text-muted-foreground">Acts</span>
                      <span className="font-medium">{scriptQuery.data.acts.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Scenes</span>
                      <span className="font-medium">
                        {scriptQuery.data.acts.reduce((total, act) => total + act.scenes.length, 0)}
                      </span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Clickable script for force-jump */}
            {session && scriptQuery.data && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Click to Jump</CardTitle>
                  <CardDescription className="text-xs">Click a line to force the cursor there.</CardDescription>
                </CardHeader>
                <CardContent className="max-h-[28rem] overflow-y-auto p-0">
                  <ScriptRenderer
                    script={scriptQuery.data}
                    highlightedLine={position}
                    fontSize="sm"
                    onLineClick={handleLineClick}
                  />
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
