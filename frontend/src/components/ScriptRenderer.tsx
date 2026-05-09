import { useEffect, useMemo, useRef } from 'react';
import { PositionUpdate, Script, ScriptLine } from '../types';
import { cn } from '../lib/utils';

type FontSize = 'sm' | 'md' | 'lg';

interface ScriptRendererProps {
  script: Script;
  highlightedLine?: PositionUpdate | null;
  fontSize?: FontSize;
  /** When provided, lines are clickable and this callback fires with the 0-based SeqIdx */
  onLineClick?: (seqIdx: number) => void;
}

const palette = ['#f8d67a', '#77c7bd', '#e88a9a', '#9fb4ff', '#caa6f7', '#a4d58e', '#f0a56b'];

const fontSizeClasses: Record<FontSize, string> = {
  sm: 'text-sm sm:text-base leading-6',
  md: 'text-base sm:text-lg leading-7',
  lg: 'text-lg sm:text-xl leading-8',
};

export function ScriptRenderer({ script, highlightedLine, fontSize = 'md', onLineClick }: ScriptRendererProps) {
  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const characterColors = useMemo(() => new Map<string, string>(), [script]);

  // Build a flat seq index so we can call onLineClick with the correct position.
  const seqMap = useMemo(() => {
    const m = new Map<number, number>(); // line.id → seqIdx
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

  useEffect(() => {
    activeLineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightedLine?.act, highlightedLine?.scene, highlightedLine?.line]);

  function isActiveLine(actIdx: number, sceneIdx: number, line: ScriptLine): boolean {
    if (!highlightedLine) return false;
    return highlightedLine.act === actIdx && highlightedLine.scene === sceneIdx && highlightedLine.line === line.id;
  }

  function colorFor(character: string) {
    const existing = characterColors.get(character);
    if (existing) return existing;
    let hash = 0;
    for (const char of character) hash = char.charCodeAt(0) + ((hash << 5) - hash);
    const color = palette[Math.abs(hash) % palette.length];
    characterColors.set(character, color);
    return color;
  }

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
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
                  const active = isActiveLine(actIdx, sceneIdx, line);
                  const seqIdx = seqMap.get(line.id) ?? 0;
                  return (
                    <div
                      key={line.id}
                      ref={active ? activeLineRef : null}
                      onClick={onLineClick ? () => onLineClick(seqIdx) : undefined}
                      className={cn(
                        'grid grid-cols-[6.75rem_1fr] gap-3 rounded-md px-3 py-2 duration-300 transition-colors sm:grid-cols-[8rem_1fr]',
                        active && 'bg-secondary/10 ring-1 ring-secondary',
                        onLineClick && 'cursor-pointer hover:bg-muted/20',
                      )}
                    >
                      <span
                        className="pt-1 text-xs font-bold uppercase leading-5"
                        style={{ color: colorFor(line.character) }}
                      >
                        {line.character}
                      </span>
                      <p className={cn('font-serif text-foreground', fontSizeClasses[fontSize])}>{line.text}</p>
                    </div>
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
