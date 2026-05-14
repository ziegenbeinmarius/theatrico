import { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen } from 'lucide-react';
import type { Annotation } from '@theatrico/shared';
import { AnnotationModal } from '../components/AnnotationModal';
import { ScriptRenderer } from '../components/ScriptRenderer';
import { Badge } from '../components/ui/badge';
import { useScriptQuery } from '../hooks/useSessions';
import {
  buildAnnotationMap,
  useAnnotationsQuery,
  useCreateAnnotationMutation,
  useDeleteAnnotationMutation,
  useUpdateAnnotationMutation,
} from '../hooks/useAnnotations';
import { Script, ScriptAct, ScriptScene, ScriptLine } from '../types';

interface AnnotationTarget {
  seqIdx: number;
  lineLabel: string;
  annotations: Annotation[];
}

function buildLineLabel(script: Script, seqIdx: number): string {
  let idx = 0;
  for (const act of script.acts) {
    for (const scene of act.scenes) {
      for (const line of scene.lines) {
        if (idx === seqIdx) {
          const charPart = line.character ? `${line.character} · ` : '';
          return `${charPart}${line.text.slice(0, 60)}${line.text.length > 60 ? '…' : ''}`;
        }
        idx++;
      }
    }
  }
  return `Line ${seqIdx + 1}`;
}

function countAnnotations(annotationMap: Map<number, Annotation[]>): { notes: number; cues: number } {
  let notes = 0;
  let cues = 0;
  for (const list of annotationMap.values()) {
    for (const a of list) {
      if (a.type === 'cue') cues++;
      else notes++;
    }
  }
  return { notes, cues };
}

export function ScriptEditorPage() {
  const { id } = useParams<{ id: string }>();
  const scriptId = id ? decodeURIComponent(id) : '';

  const scriptQuery = useScriptQuery(scriptId || undefined);
  const annotationsQuery = useAnnotationsQuery(scriptId || undefined);

  const annotationMap = useMemo(
    () => buildAnnotationMap(annotationsQuery.data),
    [annotationsQuery.data],
  );

  const createAnnotation = useCreateAnnotationMutation(scriptId);
  const updateAnnotation = useUpdateAnnotationMutation(scriptId);
  const deleteAnnotation = useDeleteAnnotationMutation(scriptId);

  const [annotationTarget, setAnnotationTarget] = useState<AnnotationTarget | null>(null);

  const handleAnnotationClick = useCallback(
    (seqIdx: number, annotations: Annotation[]) => {
      if (!scriptQuery.data?.script) return;
      setAnnotationTarget({
        seqIdx,
        lineLabel: buildLineLabel(scriptQuery.data.script, seqIdx),
        annotations,
      });
    },
    [scriptQuery.data],
  );

  const handleLineClick = useCallback(
    (seqIdx: number) => {
      handleAnnotationClick(seqIdx, annotationMap.get(seqIdx) ?? []);
    },
    [annotationMap, handleAnnotationClick],
  );

  function handleSave(type: string, content: string) {
    if (!annotationTarget) return;
    const existing = annotationTarget.annotations[0] ?? null;
    if (existing) {
      updateAnnotation.mutate(
        { id: existing.id, type, content },
        { onSuccess: () => setAnnotationTarget(null) },
      );
    } else {
      createAnnotation.mutate(
        { lineIndex: annotationTarget.seqIdx, type, content },
        { onSuccess: () => setAnnotationTarget(null) },
      );
    }
  }

  function handleDelete(id: number) {
    deleteAnnotation.mutate(id, { onSuccess: () => setAnnotationTarget(null) });
  }

  const counts = useMemo(() => countAnnotations(annotationMap), [annotationMap]);
  const script = scriptQuery.data?.script ?? null;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(143,29,44,0.2),transparent_30rem),linear-gradient(135deg,#130f13_0%,#211318_45%,#101716_100%)]">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-[#130f13]/90 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            to="/scripts"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            Scripts
          </Link>
          {script && (
            <>
              <span className="text-muted-foreground/40">/</span>
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <BookOpen className="h-3.5 w-3.5 text-secondary" />
                {script.title}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {counts.cues > 0 && (
            <Badge
              variant="outline"
              className="gap-1 text-xs text-amber-400 border-amber-500/40"
            >
              ⚡ {counts.cues} cue{counts.cues !== 1 ? "s" : ""}
            </Badge>
          )}
          {counts.notes > 0 && (
            <Badge variant="outline" className="gap-1 text-xs">
              📝 {counts.notes} note{counts.notes !== 1 ? "s" : ""}
            </Badge>
          )}
          <span className="hidden text-xs text-muted-foreground sm:block">
            Click any line to add a note or cue
          </span>
        </div>
      </header>

      {/* Content */}
      {scriptQuery.isLoading ? (
        <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
          Loading script…
        </div>
      ) : scriptQuery.isError || !script ? (
        <div className="flex flex-col items-center justify-center gap-3 px-4 py-24 text-center">
          <p className="text-sm text-destructive">Script not found.</p>
          <Link
            to="/scripts"
            className="text-sm underline text-muted-foreground hover:text-foreground"
          >
            Back to library
          </Link>
        </div>
      ) : (
        <ScriptRenderer
          script={script}
          fontSize="md"
          onLineClick={handleLineClick}
          annotationMap={annotationMap}
          onAnnotationClick={handleAnnotationClick}
          showAnnotationsSplit
        />
      )}

      {annotationTarget && (
        <AnnotationModal
          annotation={annotationTarget.annotations[0] ?? null}
          lineIndex={annotationTarget.seqIdx}
          lineLabel={annotationTarget.lineLabel}
          onSave={(type, content) => handleSave(type, content)}
          onDelete={annotationTarget.annotations[0] ? handleDelete : undefined}
          onClose={() => setAnnotationTarget(null)}
          isPending={
            createAnnotation.isPending ||
            updateAnnotation.isPending ||
            deleteAnnotation.isPending
          }
        />
      )}
    </main>
  );
}
