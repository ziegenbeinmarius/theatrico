import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { Annotation, AnnotationType, CueContent, CueType } from '@theatrico/shared';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

const CUE_TYPE_LABELS: Record<CueType, string> = {
  lighting: 'Lighting',
  sound: 'Sound',
  stage_direction: 'Stage direction',
  custom: 'Custom',
};

interface Props {
  /** When editing an existing annotation; null when creating new */
  annotation: Annotation | null;
  /** 0-based sequential line index this annotation will be attached to */
  lineIndex: number;
  /** Short label shown in the modal header (e.g. "HAMLET · To be or not to be…") */
  lineLabel: string;
  onSave: (type: AnnotationType, content: string) => void;
  onDelete?: (id: number) => void;
  onClose: () => void;
  isPending?: boolean;
}

function parseCueContent(raw: string): CueContent {
  try {
    return JSON.parse(raw) as CueContent;
  } catch {
    return { cue_type: 'custom', description: raw };
  }
}

export function AnnotationModal({
  annotation,
  lineLabel,
  onSave,
  onDelete,
  onClose,
  isPending,
}: Props) {
  const isEditing = annotation !== null;
  const initialType: AnnotationType = annotation?.type === 'cue' ? 'cue' : 'note';
  const initialCue = annotation?.type === 'cue' ? parseCueContent(annotation.content) : null;

  const [type, setType] = useState<AnnotationType>(initialType);
  const [noteContent, setNoteContent] = useState(
    annotation?.type === 'note' ? annotation.content : '',
  );
  const [cueType, setCueType] = useState<CueType>(initialCue?.cue_type ?? 'lighting');
  const [cueDescription, setCueDescription] = useState(initialCue?.description ?? '');

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (type === 'note') {
      onSave('note', noteContent.trim());
    } else {
      const cueContent: CueContent = { cue_type: cueType, description: cueDescription.trim() };
      onSave('cue', JSON.stringify(cueContent));
    }
  }

  const isValid =
    type === 'note' ? noteContent.trim().length > 0 : cueDescription.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {isEditing ? 'Edit annotation' : 'Add annotation'}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{lineLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          {/* Type selector */}
          <div className="flex gap-2">
            {(['note', 'cue'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors border',
                  type === t
                    ? 'bg-secondary text-secondary-foreground border-secondary'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {t === 'note' ? 'Note' : 'Cue'}
              </button>
            ))}
          </div>

          {type === 'note' ? (
            <textarea
              className="w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              rows={4}
              placeholder="Enter note…"
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              autoFocus
            />
          ) : (
            <div className="space-y-3">
              {/* Cue sub-type */}
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(CUE_TYPE_LABELS) as CueType[]).map((ct) => (
                  <button
                    key={ct}
                    type="button"
                    onClick={() => setCueType(ct)}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-xs font-medium border transition-colors text-left',
                      cueType === ct
                        ? 'bg-secondary/20 border-secondary text-secondary-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {CUE_TYPE_LABELS[ct]}
                  </button>
                ))}
              </div>
              {/* Description */}
              <textarea
                className="w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                rows={3}
                placeholder={`Describe the ${CUE_TYPE_LABELS[cueType].toLowerCase()} cue…`}
                value={cueDescription}
                onChange={(e) => setCueDescription(e.target.value)}
                autoFocus
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-2 pt-1">
            {isEditing && onDelete && annotation ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => onDelete(annotation.id)}
                disabled={isPending}
              >
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!isValid || isPending}>
                {isPending ? 'Saving…' : isEditing ? 'Save' : 'Add'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
