import { type ReactNode, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Sun, Moon, Wifi, WifiOff } from 'lucide-react';
import { ScriptRenderer } from '../components/ScriptRenderer';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { useWebSocket } from '../hooks/useWebSocket';
import { useSessionQuery } from '../hooks/useSessions';

type FontSize = 'sm' | 'md' | 'lg';

export function ScriptView() {
  const { code } = useParams<{ code: string }>();
  const sessionQuery = useSessionQuery(code);
  const { status, lastPosition, lastPaused } = useWebSocket(sessionQuery.data ? code : undefined);
  const [dark, setDark] = useState(true);
  const [fontSize, setFontSize] = useState<FontSize>('md');

  if (sessionQuery.isLoading) return <Centered dark={dark}>Loading...</Centered>;
  if (sessionQuery.isError || !sessionQuery.data) {
    return (
      <Centered dark={dark}>
        <div className="space-y-4 text-center">
          <p>Session not found.</p>
          <Button asChild variant="secondary">
            <Link to="/join">Join Session</Link>
          </Button>
        </div>
      </Centered>
    );
  }

  const session = sessionQuery.data;
  const paused = lastPaused ?? false;

  return (
    <div className={dark ? 'dark' : ''}>
      <div className="min-h-screen bg-background text-foreground transition-colors">
        <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-muted-foreground">Session {session.join_code}</p>
              <h1 className="truncate text-lg font-semibold tracking-normal">{session.script.title}</h1>
            </div>
            <div className="flex items-center gap-2">
              {paused && (
                <Badge variant="outline" className="text-yellow-400 border-yellow-600">Paused</Badge>
              )}
              <StatusBadge status={status} />
              <button
                onClick={() => setFontSize(f => f === 'sm' ? 'md' : f === 'md' ? 'lg' : 'sm')}
                className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                aria-label="Toggle font size"
              >
                {fontSize === 'sm' ? 'A' : fontSize === 'md' ? 'A+' : 'A++'}
              </button>
              <button
                onClick={() => setDark(d => !d)}
                className="rounded border border-border p-1.5 text-muted-foreground hover:text-foreground"
                aria-label="Toggle dark mode"
              >
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </header>
        <ScriptRenderer
          script={session.script}
          highlightedLine={lastPosition}
          fontSize={fontSize}
        />
      </div>
    </div>
  );
}

function Centered({ children, dark }: { children: ReactNode; dark: boolean }) {
  return (
    <div className={dark ? 'dark' : ''}>
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        {children}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    connected: 'Live',
    connecting: 'Connecting...',
    reconnecting: 'Reconnecting...',
    disconnected: 'Disconnected',
  };
  const live = status === 'connected';
  return (
    <Badge variant={live ? 'secondary' : 'outline'} className="gap-1.5">
      {live ? (
        <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {labels[status] ?? status}
    </Badge>
  );
}
