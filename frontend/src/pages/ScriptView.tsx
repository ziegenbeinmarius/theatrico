import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useWebSocket } from '../hooks/useWebSocket';
import { SessionInfo, ScriptLine } from '../types';

const statusColors: Record<string, string> = {
  connected: '#4caf50',
  connecting: '#ff9800',
  reconnecting: '#ff9800',
  disconnected: '#e05c5c',
};

export function ScriptView() {
  const { code } = useParams<{ code: string }>();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loadError, setLoadError] = useState('');
  const { status, lastPosition } = useWebSocket(code ?? '');
  const activeLineRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!code) return;
    fetch(`/api/sessions/${code}`)
      .then(r => {
        if (!r.ok) throw new Error('not found');
        return r.json() as Promise<SessionInfo>;
      })
      .then(setSession)
      .catch(() => setLoadError('Session not found.'));
  }, [code]);

  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [lastPosition]);

  if (loadError) return <Centered>{loadError}</Centered>;
  if (!session) return <Centered>Loading…</Centered>;

  function isActiveLine(actIdx: number, sceneIdx: number, line: ScriptLine): boolean {
    if (!lastPosition) return false;
    return lastPosition.act === actIdx && lastPosition.scene === sceneIdx && lastPosition.line === line.id;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#111', color: '#eee', fontFamily: 'Georgia, serif' }}>
      <header style={{ position: 'sticky', top: 0, background: '#1a1a1a', borderBottom: '1px solid #333', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: 1, fontWeight: 700, fontSize: 18 }}>{session.script.title}</span>
        <StatusBadge status={status} />
      </header>
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>
        {session.script.acts.map((act, ai) => (
          <div key={ai}>
            <h2 style={{ fontSize: 22, fontVariant: 'small-caps', borderBottom: '1px solid #333', paddingBottom: 8, marginTop: ai === 0 ? 0 : 40 }}>
              {act.title}
            </h2>
            {act.scenes.map((scene, si) => (
              <div key={si} style={{ marginTop: 24 }}>
                <h3 style={{ fontSize: 16, color: '#aaa', fontStyle: 'italic', marginBottom: 16 }}>{scene.title}</h3>
                {scene.lines.map(line => {
                  const active = isActiveLine(ai, si, line);
                  return (
                    <div
                      key={line.id}
                      ref={active ? activeLineRef : null}
                      style={{
                        display: 'flex',
                        gap: 12,
                        padding: '8px 12px',
                        borderRadius: 6,
                        marginBottom: 4,
                        background: active ? 'rgba(74,124,246,0.25)' : 'transparent',
                        transition: 'background 0.3s',
                        outline: active ? '1px solid #4a7cf6' : 'none',
                      }}
                    >
                      <span style={{ minWidth: 120, fontWeight: 700, fontSize: 13, color: active ? '#7aaeff' : '#888', textTransform: 'uppercase', paddingTop: 2 }}>
                        {line.character}
                      </span>
                      <span style={{ lineHeight: 1.6 }}>{line.text}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111', color: '#eee' }}>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    connected: 'Live',
    connecting: 'Connecting…',
    reconnecting: 'Reconnecting…',
    disconnected: 'Disconnected',
  };
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: statusColors[status] ?? '#aaa' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColors[status] ?? '#aaa', display: 'inline-block' }} />
      {labels[status] ?? status}
    </span>
  );
}
