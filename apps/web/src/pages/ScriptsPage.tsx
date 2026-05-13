import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, PenLine, Trash2, Upload } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { ScriptUploadModal } from '../components/ScriptUploadModal';
import { useDeleteScriptMutation, useScriptsQuery } from '../hooks/useSessions';
import { PlayInfo } from '../types';

export function ScriptsPage() {
  const scriptsQuery = useScriptsQuery();
  const deleteScript = useDeleteScriptMutation();
  const [showUpload, setShowUpload] = useState(false);

  const scripts = (scriptsQuery.data ?? []).filter((p: PlayInfo) => p.id !== 'default');

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(143,29,44,0.2),transparent_30rem),linear-gradient(135deg,#130f13_0%,#211318_45%,#101716_100%)] px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-normal">Script Library</h1>
              <p className="text-sm text-muted-foreground">Upload scripts and edit annotations</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/">← Console</Link>
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setShowUpload(true)}>
              <Upload className="h-3.5 w-3.5" />
              Upload Script
            </Button>
          </div>
        </div>

        {/* Scripts list */}
        <Card>
          <CardHeader>
            <CardTitle>Scripts</CardTitle>
            <CardDescription>
              Click "Edit" to add notes and cues to any script line.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {scriptsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : scriptsQuery.isError ? (
              <p className="text-sm text-destructive">Failed to load scripts.</p>
            ) : scripts.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <BookOpen className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No scripts yet.</p>
                <Button size="sm" onClick={() => setShowUpload(true)} className="gap-1.5">
                  <Upload className="h-3.5 w-3.5" />
                  Upload your first script
                </Button>
              </div>
            ) : (
              <ul className="space-y-2">
                {scripts.map((script: PlayInfo) => (
                  <li
                    key={script.id}
                    className="flex items-center justify-between gap-3 rounded-md bg-black/20 px-4 py-3"
                  >
                    <span className="truncate text-sm font-medium text-foreground">
                      {script.title}
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {script.id}
                      </Badge>
                      <Button asChild size="sm" variant="secondary" className="gap-1">
                        <Link to={`/scripts/${encodeURIComponent(script.id)}`}>
                          <PenLine className="h-3 w-3" />
                          Edit
                        </Link>
                      </Button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${script.title}"?`)) {
                            deleteScript.mutate(script.id);
                          }
                        }}
                        disabled={deleteScript.isPending}
                        className="text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40"
                        title="Delete script"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {deleteScript.isError && (
              <p className="mt-2 text-xs text-destructive">
                {deleteScript.error instanceof Error ? deleteScript.error.message : 'Delete failed.'}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {showUpload && (
        <ScriptUploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={() => setShowUpload(false)}
        />
      )}
    </main>
  );
}
