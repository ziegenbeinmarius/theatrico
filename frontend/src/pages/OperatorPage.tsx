import { useCallback, useEffect, useRef, useState } from 'react';
import { Clapperboard, Mic, PlusCircle, Radio, RefreshCw, ScrollText, StopCircle } from 'lucide-react';
import { QRCodeDisplay } from '../components/QRCodeDisplay';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { useCreateSessionMutation, useScriptQuery } from '../hooks/useSessions';
import { PositionUpdate } from '../types';

interface AudioDevice {
  deviceId: string;
  label: string;
}

export function OperatorPage() {
  const scriptQuery = useScriptQuery();
  const createSession = useCreateSessionMutation();
  const session = createSession.data;

  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [transcripts, setTranscripts] = useState<string[]>([]);
  const [position, setPosition] = useState<PositionUpdate | null>(null);
  const [streamError, setStreamError] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioWsRef = useRef<WebSocket | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

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

  // Position WS — connect when session is active
  useEffect(() => {
    if (!session) return;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/api/sessions/${session.join_code}/ws`);
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string);
        if (msg.type === 'position_update') setPosition(msg as PositionUpdate);
      } catch { /* ignore */ }
    };
    return () => ws.close();
  }, [session]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
        recorder.start(7000);
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
    createSession.mutate();
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(143,29,44,0.25),transparent_32rem),linear-gradient(135deg,#130f13_0%,#211318_45%,#101716_100%)] px-4 py-8 sm:px-6">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-5xl content-center gap-6 lg:grid-cols-[1fr_24rem]">
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
              <Clapperboard className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-normal">Theatrico</h1>
              <p className="text-sm text-muted-foreground">Operator console</p>
            </div>
          </div>

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
                  <Button className="w-full" variant="outline" onClick={handleNewSession} disabled={createSession.isPending}>
                    {createSession.isPending
                      ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                      : <PlusCircle className="h-4 w-4" aria-hidden="true" />}
                    New Session
                  </Button>
                </>
              ) : (
                <Button size="lg" className="w-full" onClick={handleNewSession} disabled={createSession.isPending}>
                  {createSession.isPending
                    ? <RefreshCw className="h-5 w-5 animate-spin" aria-hidden="true" />
                    : <PlusCircle className="h-5 w-5" aria-hidden="true" />}
                  New Session
                </Button>
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
                      Act {position.act + 1} · Scene {position.scene + 1} · Line {position.line + 1}
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
        </section>

        {/* Script summary sidebar */}
        <Card className="self-center">
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
      </div>
    </main>
  );
}
