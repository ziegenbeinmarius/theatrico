import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BookOpen, Clapperboard, ExternalLink, PlusCircle, RefreshCw, ScrollText, Trash2,
} from 'lucide-react';
import { ScriptRenderer } from '../components/ScriptRenderer';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import {
  useCreateSessionMutation,
  useDeleteSessionMutation,
  useScriptQuery,
  useScriptsQuery,
  useSessionsQuery,
} from '../hooks/useSessions';
import { CreateSessionResponse, PlayInfo, SessionSummary } from '../types';

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
  const navigate = useNavigate();
  const scriptsQuery = useScriptsQuery();
  const sessionsQuery = useSessionsQuery();
  const createSession = useCreateSessionMutation();
  const deleteSession = useDeleteSessionMutation();

  const [selectedScript, setSelectedScript] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('');

  const scriptQuery = useScriptQuery(selectedScript || undefined);
  const displayScript = scriptQuery.data?.script ?? null;

  function handleNewSession() {
    if (!selectedScript) return;
    createSession.mutate(
      { language: selectedLanguage, scriptId: selectedScript },
      {
        onSuccess: (data: CreateSessionResponse) => {
          if (data?.join_code) navigate(`/operator/${data.join_code}`);
        },
      },
    );
  }

  const sessions = sessionsQuery.data ?? [];

  return (
    <main className="h-screen overflow-hidden flex flex-col bg-[radial-gradient(circle_at_top_left,rgba(143,29,44,0.25),transparent_32rem),linear-gradient(135deg,#130f13_0%,#211318_45%,#101716_100%)] px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-[90rem] flex flex-col gap-6 flex-1 min-h-0">
        {/* Header */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center justify-center rounded-md h-11 w-11 bg-secondary text-secondary-foreground">
            <Clapperboard className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-normal">Theatrico</h1>
            <p className="text-sm text-muted-foreground">Operator console</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[28rem_1fr] flex-1 min-h-0">
          {/* Left column */}
          <div className="flex flex-col gap-4 overflow-y-auto">
            {/* Active sessions */}
            {sessions.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Active Sessions</CardTitle>
                  <CardDescription>Resume an existing session.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {sessions.map((s: SessionSummary) => (
                    <div
                      key={s.join_code}
                      className="flex items-center gap-3 rounded-md border border-border bg-background/40 px-3 py-2.5 hover:bg-background/70 transition-colors"
                    >
                      <button
                        className="flex-1 text-left min-w-0"
                        onClick={() => navigate(`/operator/${s.join_code}`)}
                      >
                        <p className="text-sm font-medium truncate">{s.script_title || s.script_id}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-mono text-xs text-secondary tracking-widest">{s.join_code}</span>
                          {s.paused && <Badge variant="outline" className="text-[10px] py-0 h-4">Paused</Badge>}
                        </div>
                      </button>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <a
                          href={`/qr/${s.join_code}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 rounded border border-border px-1.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          QR
                        </a>
                        <button
                          onClick={() => {
                            if (confirm(`Delete session ${s.join_code}?`)) {
                              deleteSession.mutate(s.join_code);
                            }
                          }}
                          className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Delete session"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* New session form */}
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>New session</CardTitle>
                    <CardDescription>Create a join code for audience devices.</CardDescription>
                  </div>
                  <Badge variant="muted">Ready</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-sm text-muted-foreground">
                      Play <span className="text-destructive">*</span>
                    </label>
                    <Link
                      to="/scripts"
                      className="flex items-center gap-1 text-xs transition-colors text-muted-foreground hover:text-foreground"
                    >
                      <BookOpen className="w-3 h-3" />
                      Manage scripts
                    </Link>
                  </div>
                  <select
                    value={selectedScript}
                    onChange={(e) => setSelectedScript(e.target.value)}
                    className="w-full px-3 py-2 text-sm border rounded-md border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="" disabled>Select a play…</option>
                    {scriptsQuery.data
                      ?.filter((p: PlayInfo) => p.id !== 'default')
                      .map((p: PlayInfo) => (
                        <option key={p.id} value={p.id}>{p.title}</option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm text-muted-foreground">Script language</label>
                  <select
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    className="w-full px-3 py-2 text-sm border rounded-md border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>{l.label}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sets the speech recognition language so Whisper doesn't switch unexpectedly.
                  </p>
                </div>
                <Button
                  size="lg"
                  className="w-full"
                  onClick={handleNewSession}
                  disabled={createSession.isPending || !selectedScript}
                >
                  {createSession.isPending
                    ? <RefreshCw className="w-5 h-5 animate-spin" aria-hidden="true" />
                    : <PlusCircle className="w-5 h-5" aria-hidden="true" />}
                  New Session
                </Button>
                {createSession.isError && (
                  <p className="text-sm text-destructive">
                    {createSession.error instanceof Error ? createSession.error.message : 'Failed to create session.'}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right column: script preview */}
          <div className="flex flex-col min-h-0 overflow-hidden">
            {displayScript && (
              <Card className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <CardHeader className="shrink-0">
                  <div className="flex items-center gap-2">
                    <ScrollText className="w-5 h-5 text-secondary" aria-hidden="true" />
                    <CardTitle>Script Preview</CardTitle>
                  </div>
                  <CardDescription className="text-xs">Start a session to enable cursor control.</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 min-h-0 p-0 overflow-y-auto">
                  <ScriptRenderer script={displayScript} fontSize="sm" />
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
