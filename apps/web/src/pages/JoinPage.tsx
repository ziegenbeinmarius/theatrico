import { type FormEvent, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LogIn, RefreshCw } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { getSession } from '../lib/api';
import { sessionKeys } from '../hooks/useSessions';

export function JoinPage() {
  const { code: urlCode } = useParams<{ code?: string }>();
  const [code, setCode] = useState(urlCode ?? '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (urlCode) setCode(urlCode.toUpperCase());
  }, [urlCode]);

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setError('');
    setLoading(true);
    try {
      await queryClient.fetchQuery({
        queryKey: sessionKeys.detail(trimmed),
        queryFn: () => getSession(trimmed),
        retry: false,
      });
      navigate(`/script/${trimmed}`);
    } catch {
      setError('Session not found. Check the code and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(248,214,122,0.16),transparent_24rem),linear-gradient(135deg,#130f13_0%,#211318_55%,#101716_100%)] px-4 py-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Theatrico</CardTitle>
          <CardDescription>Join a live audience session.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleJoin}>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">
              Session Code
            </label>
            <Input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="XXXXXX"
              maxLength={6}
              autoFocus
              className="h-14 text-center font-mono text-2xl uppercase tracking-[0.3em]"
            />
            {error && (
              <p className="mt-2 text-sm text-destructive">{error}</p>
            )}
            <Button
              type="submit"
              disabled={loading || code.trim().length === 0}
              className="mt-5 w-full"
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <LogIn className="h-4 w-4" aria-hidden="true" />
              )}
              {loading ? 'Joining...' : 'Join'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
