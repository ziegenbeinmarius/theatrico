import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export function JoinPage() {
  const { code: urlCode } = useParams<{ code?: string }>();
  const [code, setCode] = useState(urlCode ?? '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (urlCode) setCode(urlCode.toUpperCase());
  }, [urlCode]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/sessions/${trimmed}`);
      if (!res.ok) {
        setError('Session not found. Check the code and try again.');
        return;
      }
      navigate(`/script/${trimmed}`);
    } catch {
      setError('Could not connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111', color: '#eee' }}>
      <div style={{ width: 320, padding: 32, background: '#1e1e1e', borderRadius: 12 }}>
        <h1 style={{ margin: '0 0 24px', fontSize: 24, fontWeight: 700 }}>Theatrico</h1>
        <form onSubmit={handleJoin}>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: '#aaa' }}>
            Session Code
          </label>
          <input
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="XXXXXX"
            maxLength={6}
            autoFocus
            style={{
              display: 'block',
              width: '100%',
              padding: '12px 16px',
              fontSize: 24,
              letterSpacing: 6,
              textAlign: 'center',
              background: '#2a2a2a',
              border: '1px solid #444',
              borderRadius: 8,
              color: '#fff',
              fontFamily: 'monospace',
              boxSizing: 'border-box',
            }}
          />
          {error && (
            <p style={{ color: '#e05c5c', fontSize: 13, margin: '8px 0 0' }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || code.trim().length === 0}
            style={{
              marginTop: 20,
              width: '100%',
              padding: '12px',
              background: '#4a7cf6',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 16,
              cursor: 'pointer',
              opacity: loading || code.trim().length === 0 ? 0.5 : 1,
            }}
          >
            {loading ? 'Joining…' : 'Join'}
          </button>
        </form>
      </div>
    </div>
  );
}
