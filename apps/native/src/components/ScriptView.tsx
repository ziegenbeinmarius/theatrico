import { useEffect, useRef } from 'react';
import { FlatList } from 'react-native';
import type { Annotation } from '@theatrico/shared';
import type { FlatLine } from '@/lib/scriptUtils';
import type { Position } from '@/domain';
import { LineItem, type ScriptListItem } from '@/components/LineItem';

function buildScriptItems(
  flatLines: FlatLine[],
  currentPosition: Position | null,
  annotationMap?: Map<number, Annotation[]>,
): { items: ScriptListItem[]; activeIndex: number } {
  const items: ScriptListItem[] = [];
  let lastActId = '';
  let lastSceneId = '';
  let activeIndex = -1;
  let seqIdx = 0;

  for (const fl of flatLines) {
    if (fl.act.id !== lastActId) {
      items.push({ type: 'act_header', id: `act-${fl.act.id}`, title: fl.act.title });
      lastActId = fl.act.id;
      lastSceneId = '';
    }
    if (fl.scene.id !== lastSceneId) {
      items.push({ type: 'scene_header', id: `scene-${fl.scene.id}`, title: fl.scene.title });
      lastSceneId = fl.scene.id;
    }
    const isActive = currentPosition?.lineId === fl.line.id;
    if (isActive) activeIndex = items.length;
    items.push({
      type: 'line',
      id: fl.line.id,
      flatLine: fl,
      isActive,
      seqIdx,
      annotations: annotationMap?.get(seqIdx),
    });
    seqIdx++;
  }

  return { items, activeIndex };
}

interface Props {
  flatLines: FlatLine[];
  currentPosition: Position | null;
  annotationMap?: Map<number, Annotation[]>;
  onAnnotationPress?: (seqIdx: number, annotations: Annotation[]) => void;
}

export function ScriptView({ flatLines, currentPosition, annotationMap, onAnnotationPress }: Props) {
  const listRef = useRef<FlatList<ScriptListItem>>(null);
  const { items, activeIndex } = buildScriptItems(flatLines, currentPosition, annotationMap);

  useEffect(() => {
    if (activeIndex < 0 || items.length === 0) return;
    listRef.current?.scrollToIndex({
      index: activeIndex,
      animated: true,
      viewPosition: 0.35,
    });
  }, [activeIndex, items.length]);

  return (
    <FlatList
      ref={listRef}
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <LineItem item={item} onAnnotationPress={onAnnotationPress} />
      )}
      contentContainerClassName="py-4 pb-16"
      onScrollToIndexFailed={(info) => {
        listRef.current?.scrollToOffset({
          offset: info.averageItemLength * info.index,
          animated: true,
        });
      }}
    />
  );
}
