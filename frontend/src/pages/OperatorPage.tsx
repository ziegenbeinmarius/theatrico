import { useState } from 'react';
import { QRCodeDisplay } from '../components/QRCodeDisplay';

interface CreateResponse {
  join_code: string;
  qr_url: string;
}

export function OperatorPage() {
  const [session, setSession] = useState<CreateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function createSession() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/sessions', { method: 'POST' });
      if (!res.ok) {
        const message = (await res.text()).trim();
        throw new Error(message || `server error (${res.status})`);
      }
      const data = await res.json() as CreateResponse;
      setSession(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create session.';
      setError(`Failed to create session: ${message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#111', color: '#eee', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
      <h1 style={{ marginBottom: 32 }}>Theatrico — Operator</h1>
      {!session ? (
        <>
          <button
            onClick={createSession}
            disabled={loading}
            style={{ padding: '14px 32px', fontSize: 18, background: '#4a7cf6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            {loading ? 'Creating…' : 'New Session'}
          </button>
          {error && <p style={{ color: '#e05c5c', marginTop: 12 }}>{error}</p>}
        </>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <p style={{ marginBottom: 16, color: '#aaa' }}>Scan to join or share the code:</p>
          <QRCodeDisplay joinCode={session.join_code} />
          <button
            onClick={() => setSession(null)}
            style={{ marginTop: 24, padding: '10px 24px', background: '#333', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            New Session
          </button>
        </div>
      )}
    </div>
  );
}
