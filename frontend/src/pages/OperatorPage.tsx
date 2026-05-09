import { Clapperboard, PlusCircle, RefreshCw, ScrollText } from 'lucide-react';
import { QRCodeDisplay } from '../components/QRCodeDisplay';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { useCreateSessionMutation, useScriptQuery } from '../hooks/useSessions';

export function OperatorPage() {
  const scriptQuery = useScriptQuery();
  const createSession = useCreateSessionMutation();
  const session = createSession.data;

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
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => createSession.mutate()}
                    disabled={createSession.isPending}
                  >
                    {createSession.isPending ? (
                      <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <PlusCircle className="h-4 w-4" aria-hidden="true" />
                    )}
                    New Session
                  </Button>
                </>
              ) : (
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => createSession.mutate()}
                  disabled={createSession.isPending}
                >
                  {createSession.isPending ? (
                    <RefreshCw className="h-5 w-5 animate-spin" aria-hidden="true" />
                  ) : (
                    <PlusCircle className="h-5 w-5" aria-hidden="true" />
                  )}
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
        </section>

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
