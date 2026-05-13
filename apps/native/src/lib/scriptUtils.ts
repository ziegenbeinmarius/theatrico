import type { Act, Line, Play, Position, Scene } from '@/domain';

export interface FlatLine {
  position: Position;
  line: Line;
  actTitle: string;
  sceneTitle: string;
  act: Act;
  scene: Scene;
}

export function flattenLines(play: Play): FlatLine[] {
  const result: FlatLine[] = [];
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      for (const line of scene.lines) {
        result.push({
          position: { playId: play.id, actId: act.id, sceneId: scene.id, lineId: line.id },
          line,
          actTitle: act.title,
          sceneTitle: scene.title,
          act,
          scene,
        });
      }
    }
  }
  return result;
}

export function findLineIndex(lines: FlatLine[], lineId: string): number {
  return lines.findIndex((fl) => fl.position.lineId === lineId);
}
