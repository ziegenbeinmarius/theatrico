import { memo, useEffect, useMemo, useRef, useCallback } from 'react';
import type { Annotation } from '@theatrico/shared';
import { PositionUpdate, Script, ScriptLine } from '../types';
import { cn } from '../lib/utils';

type FontSize = 'sm' | 'md' | 'lg';

interface ScriptRendererProps {
  script: Script;
  highlightedLine?: PositionUpdate | null;
  fontSize?: FontSize;
  /** When provided, lines are clickable and this callback fires with the 0-based SeqIdx */
  onLineClick?: (seqIdx: number) => void;
  /** Map from seqIdx → annotations for that line */
  annotationMap?: Map<number, Annotation[]>;
  /** Called when the annotation badge on a line is clicked */
  onAnnotationClick?: (seqIdx: number, annotations: Annotation[]) => void;
  /** When true, annotation content is expanded inline below each line instead of a badge */
  showAnnotationsInline?: boolean;
  /**
   * When true: on xl+ screens notes appear in a left margin column and cues in a right margin
   * column alongside each line. On smaller screens falls back to inline display.
   */
  showAnnotationsSplit?: boolean;
}

const palette = ['#f8d67a', '#77c7bd', '#e88a9a', '#9fb4ff', '#caa6f7', '#a4d58e', '#f0a56b'];

const fontSizeClasses: Record<FontSize, string> = {
  sm: 'text-sm sm:text-base leading-6',
  md: 'text-base sm:text-lg leading-7',
  lg: 'text-lg sm:text-xl leading-8',
};

interface LineRowProps {
  line: ScriptLine;
  active: boolean;
  upcoming: boolean;
  color: string;
  fontSize: FontSize;
  clickable: boolean;
  onLineClick?: (seqIdx: number) => void;
  seqIdx: number;
  activeLineRef: React.MutableRefObject<HTMLDivElement | null>;
  annotations?: Annotation[];
  onAnnotationClick?: (seqIdx: number, annotations: Annotation[]) => void;
  showAnnotationsInline?: boolean;
  showAnnotationsSplit?: boolean;
}

function AnnotationBadge({
  annotations,
  seqIdx,
  onClick,
}: {
  annotations: Annotation[];
  seqIdx: number;
  onClick: (seqIdx: number, annotations: Annotation[]) => void;
}) {
  const hasCue = annotations.some((a) => a.type === 'cue');
  const hasNote = annotations.some((a) => a.type === 'note');
  return (
    <button
      type="button"
      title={`${annotations.length} annotation${annotations.length !== 1 ? 's' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick(seqIdx, annotations);
      }}
      className={cn(
        'ml-1.5 inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-bold leading-none transition-opacity hover:opacity-80',
        hasCue
          ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40'
          : 'bg-primary/15 text-primary ring-1 ring-primary/30',
      )}
    >
      {hasCue && <span>⚡</span>}
      {hasNote && !hasCue && <span>📝</span>}
      <span>{annotations.length}</span>
    </button>
  );
}

function InlineAnnotations({
  annotations,
  seqIdx,
  onAnnotationClick,
}: {
  annotations: Annotation[];
  seqIdx: number;
  onAnnotationClick?: (seqIdx: number, annotations: Annotation[]) => void;
}) {
  return (
    <div className="mt-1 flex flex-col gap-0.5">
      {annotations.map((a) => {
        let icon = '⚡';
        let content = a.content;
        if (a.type === 'cue') {
          try {
            const parsed = JSON.parse(a.content) as { cue_type: string; description: string };
            const icons: Record<string, string> = { lighting: '💡', sound: '🔊', stage_direction: '🎭', custom: '⚡' };
            icon = icons[parsed.cue_type] ?? '⚡';
            content = parsed.description;
          } catch { /* raw string */ }
        } else {
          icon = '📝';
        }
        return (
          <button
            key={a.id}
            type="button"
            onClick={(e) => { e.stopPropagation(); onAnnotationClick?.(seqIdx, annotations); }}
            className={cn(
              'flex items-start gap-1.5 rounded px-1.5 py-0.5 text-left text-xs leading-4 transition-opacity hover:opacity-80',
              a.type === 'cue'
                ? 'bg-amber-500/15 text-amber-400'
                : 'bg-primary/10 text-primary/80',
            )}
          >
            <span className="shrink-0">{icon}</span>
            <span>{content}</span>
          </button>
        );
      })}
    </div>
  );
}

const LineRow = memo(function LineRow({
  line,
  active,
  upcoming,
  color,
  fontSize,
  clickable,
  onLineClick,
  seqIdx,
  activeLineRef,
  annotations,
  onAnnotationClick,
  showAnnotationsInline,
  showAnnotationsSplit,
}: LineRowProps) {
  const notes = showAnnotationsSplit ? (annotations ?? []).filter((a) => a.type === 'note') : [];
  const cues = showAnnotationsSplit ? (annotations ?? []).filter((a) => a.type === 'cue') : [];

  return (
    <div
      ref={active ? (el) => { activeLineRef.current = el; } : undefined}
      onClick={onLineClick ? () => onLineClick(seqIdx) : undefined}
      className={cn(
        'group grid gap-x-3 rounded-md px-3 py-2 duration-300 transition-colors',
        // Default 2-col layout; split mode expands to 4-col on xl screens
        showAnnotationsSplit
          ? 'grid-cols-[6.75rem_1fr] xl:grid-cols-[10rem_8rem_1fr_10rem]'
          : 'grid-cols-[6.75rem_1fr] sm:grid-cols-[8rem_1fr]',
        active && 'bg-secondary/10 ring-1 ring-secondary',
        upcoming && !active && 'bg-primary/5 ring-1 ring-primary/30 opacity-70',
        clickable && 'cursor-pointer hover:bg-muted/20',
      )}
    >
      {/* Notes margin — left column, xl only */}
      {showAnnotationsSplit && (
        <div className="hidden xl:flex xl:flex-col xl:items-end xl:gap-0.5 xl:pr-2 xl:pt-1">
          {notes.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={(e) => { e.stopPropagation(); onAnnotationClick?.(seqIdx, annotations ?? []); }}
              className="flex items-start gap-1 rounded px-1.5 py-0.5 text-right text-[11px] leading-4 text-primary/70 bg-primary/10 hover:opacity-80 transition-opacity"
            >
              <span className="flex-1 text-right">{a.content}</span>
              <span className="shrink-0">📝</span>
            </button>
          ))}
        </div>
      )}

      {/* Character name */}
      <span
        className="pt-1 text-xs font-bold uppercase leading-5"
        style={{ color }}
      >
        {line.character}
      </span>

      {/* Line text + inline annotations (mobile) */}
      <div>
        <div className="flex flex-wrap items-start gap-1">
          <p className={cn('font-serif text-foreground', fontSizeClasses[fontSize])}>{line.text}</p>
          {annotations && annotations.length > 0 && onAnnotationClick && !showAnnotationsInline && !showAnnotationsSplit && (
            <AnnotationBadge
              annotations={annotations}
              seqIdx={seqIdx}
              onClick={onAnnotationClick}
            />
          )}
          {(!annotations || annotations.length === 0) && onAnnotationClick && (
            <button
              type="button"
              title="Add annotation"
              onClick={(e) => {
                e.stopPropagation();
                onAnnotationClick(seqIdx, []);
              }}
              className="ml-1 hidden rounded px-1 py-0.5 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
            >
              +
            </button>
          )}
        </div>
        {/* Inline annotations: always when showAnnotationsInline; mobile-only fallback when showAnnotationsSplit */}
        {(showAnnotationsInline || showAnnotationsSplit) && annotations && annotations.length > 0 && (
          <div className={showAnnotationsSplit ? 'xl:hidden' : undefined}>
            <InlineAnnotations
              annotations={annotations}
              seqIdx={seqIdx}
              onAnnotationClick={onAnnotationClick}
            />
          </div>
        )}
      </div>

      {/* Cues margin — right column, xl only */}
      {showAnnotationsSplit && (
        <div className="hidden xl:flex xl:flex-col xl:items-start xl:gap-0.5 xl:pl-2 xl:pt-1">
          {cues.map((a) => {
            let icon = '⚡';
            let content = a.content;
            try {
              const parsed = JSON.parse(a.content) as { cue_type: string; description: string };
              const icons: Record<string, string> = { lighting: '💡', sound: '🔊', stage_direction: '🎭', custom: '⚡' };
              icon = icons[parsed.cue_type] ?? '⚡';
              content = parsed.description;
            } catch { /* raw string */ }
            return (
              <button
                key={a.id}
                type="button"
                onClick={(e) => { e.stopPropagation(); onAnnotationClick?.(seqIdx, annotations ?? []); }}
                className="flex items-start gap-1.5 rounded px-1.5 py-0.5 text-[11px] leading-4 text-amber-400 bg-amber-500/15 hover:opacity-80 transition-opacity"
              >
                <span className="shrink-0">{icon}</span>
                <span>{content}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

export function ScriptRenderer({
  script,
  highlightedLine,
  fontSize = 'md',
  onLineClick,
  annotationMap,
  onAnnotationClick,
  showAnnotationsInline,
  showAnnotationsSplit,
}: ScriptRendererProps) {
  const activeLineRef = useRef<HTMLDivElement | null>(null);

  const characterColors = useMemo(() => {
    const m = new Map<string, string>();
    for (const act of script.acts) {
      for (const scene of act.scenes) {
        for (const line of scene.lines) {
          if (line.character && !m.has(line.character)) {
            m.set(line.character, palette[m.size % palette.length]);
          }
        }
      }
    }
    return m;
  }, [script]);

  const seqMap = useMemo(() => {
    const m = new Map<number, number>();
    let seq = 0;
    for (const act of script.acts) {
      for (const scene of act.scenes) {
        for (const line of scene.lines) {
          m.set(line.id, seq++);
        }
      }
    }
    return m;
  }, [script]);

  // Maps seqIdx → {actIdx, sceneIdx, lineId} for upcoming-line lookup.
  const seqToPos = useMemo(() => {
    const m = new Map<number, { actIdx: number; sceneIdx: number; lineId: number }>();
    let seq = 0;
    for (const [actIdx, act] of script.acts.entries()) {
      for (const [sceneIdx, scene] of act.scenes.entries()) {
        for (const line of scene.lines) {
          m.set(seq++, { actIdx, sceneIdx, lineId: line.id });
        }
      }
    }
    return m;
  }, [script]);

  const upcomingPos = useMemo(() => {
    if (!highlightedLine) return null;
    const cur = seqMap.get(highlightedLine.line);
    if (cur === undefined) return null;
    return seqToPos.get(cur + 1) ?? null;
  }, [highlightedLine, seqMap, seqToPos]);

  useEffect(() => {
    activeLineRef.current?.scrollIntoView({ behavior: 'auto', block: 'center' });
  }, [highlightedLine?.act, highlightedLine?.scene, highlightedLine?.line]);

  const isActiveLine = useCallback((actIdx: number, sceneIdx: number, line: ScriptLine): boolean => {
    if (!highlightedLine) return false;
    return highlightedLine.act === actIdx && highlightedLine.scene === sceneIdx && highlightedLine.line === line.id;
  }, [highlightedLine]);

  const isUpcomingLine = useCallback((actIdx: number, sceneIdx: number, line: ScriptLine): boolean => {
    if (!upcomingPos) return false;
    return upcomingPos.actIdx === actIdx && upcomingPos.sceneIdx === sceneIdx && upcomingPos.lineId === line.id;
  }, [upcomingPos]);

  return (
    <article className={cn(
      'mx-auto w-full px-4 py-8 sm:px-6',
      showAnnotationsSplit ? 'max-w-6xl' : 'max-w-3xl',
    )}>
      {script.acts.map((act, actIdx) => (
        <section key={act.title} className={cn(actIdx === 0 ? '' : 'mt-12')}>
          <h2 className="border-b border-border pb-3 font-serif text-2xl font-semibold tracking-normal text-secondary">
            {act.title}
          </h2>
          {act.scenes.map((scene, sceneIdx) => (
            <section key={`${act.title}-${scene.title}`} className="mt-7">
              <h3 className="mb-4 font-serif text-lg italic text-muted-foreground">{scene.title}</h3>
              <div className="space-y-1">
                {scene.lines.map(line => {
                  const seq = seqMap.get(line.id) ?? 0;
                  return (
                    <LineRow
                      key={line.id}
                      line={line}
                      active={isActiveLine(actIdx, sceneIdx, line)}
                      upcoming={isUpcomingLine(actIdx, sceneIdx, line)}
                      color={characterColors.get(line.character) ?? palette[0]}
                      fontSize={fontSize}
                      clickable={!!onLineClick}
                      onLineClick={onLineClick}
                      seqIdx={seq}
                      activeLineRef={activeLineRef}
                      annotations={annotationMap?.get(seq)}
                      onAnnotationClick={onAnnotationClick}
                      showAnnotationsInline={showAnnotationsInline}
                      showAnnotationsSplit={showAnnotationsSplit}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </section>
      ))}
    </article>
  );
}
