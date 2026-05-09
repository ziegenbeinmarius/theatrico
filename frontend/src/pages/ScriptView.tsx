import { type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Wifi, WifiOff } from 'lucide-react';
import { ScriptRenderer } from '../components/ScriptRenderer';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { useWebSocket } from '../hooks/useWebSocket';
import { useSessionQuery } from '../hooks/useSessions';

export function ScriptView() {
  const { code } = useParams<{ code: string }>();
  const sessionQuery = useSessionQuery(code);
  const { status, lastPosition } = useWebSocket(sessionQuery.data ? code : undefined);

  if (sessionQuery.isLoading) return <Centered>Loading...</Centered>;
  if (sessionQuery.isError || !sessionQuery.data) {
    return (
      <Centered>
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
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#130f13_0%,#181113_44%,#101716_100%)] text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-muted-foreground">Session {session.join_code}</p>
            <h1 className="truncate text-lg font-semibold tracking-normal">{session.script.title}</h1>
          </div>
          <StatusBadge status={status} />
        </div>
      </header>
      <ScriptRenderer script={session.script} highlightedLine={lastPosition} />
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      {children}
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
