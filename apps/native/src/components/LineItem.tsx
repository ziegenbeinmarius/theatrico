import { Pressable, Text, View } from 'react-native';
import type { Annotation } from '@theatrico/shared';
import type { FlatLine } from '@/lib/scriptUtils';

export type ScriptListItem =
  | { type: 'act_header'; id: string; title: string }
  | { type: 'scene_header'; id: string; title: string }
  | { type: 'line'; id: string; flatLine: FlatLine; isActive: boolean; seqIdx: number; annotations?: Annotation[] };

interface Props {
  item: ScriptListItem;
  onAnnotationPress?: (seqIdx: number, annotations: Annotation[]) => void;
}

function AnnotationBadge({
  annotations,
  seqIdx,
  onPress,
}: {
  annotations: Annotation[];
  seqIdx: number;
  onPress: (seqIdx: number, annotations: Annotation[]) => void;
}) {
  const hasCue = annotations.some((a) => a.type === 'cue');
  return (
    <Pressable
      onPress={() => onPress(seqIdx, annotations)}
      hitSlop={8}
      className={`self-start flex-row items-center gap-0.5 px-1.5 py-0.5 rounded mt-0.5 ${
        hasCue ? 'bg-[#3a2800]' : 'bg-[#1a1030]'
      }`}
    >
      <Text className="text-[10px]">{hasCue ? '⚡' : '📝'}</Text>
      <Text
        className={`text-[10px] font-bold ${hasCue ? 'text-[#f5c842]' : 'text-[#9fb4ff]'}`}
      >
        {annotations.length}
      </Text>
    </Pressable>
  );
}

export function LineItem({ item, onAnnotationPress }: Props) {
  if (item.type === 'act_header') {
    return (
      <View className="px-4 pt-7 pb-2">
        <Text className="text-[11px] font-bold text-app-accent uppercase tracking-[2px]">
          {item.title}
        </Text>
      </View>
    );
  }

  if (item.type === 'scene_header') {
    return (
      <View className="px-4 pt-3 pb-2">
        <Text className="text-[11px] text-app-tertiary uppercase tracking-[1px]">{item.title}</Text>
      </View>
    );
  }

  const { flatLine, isActive, seqIdx, annotations } = item;
  const { line } = flatLine;
  const hasAnnotations = annotations && annotations.length > 0;

  if (line.type === 'stage_direction' || line.type === 'action') {
    return (
      <View className={`px-4 py-2 mx-2 rounded-lg ${isActive ? 'bg-app-card' : ''}`}>
        <Text
          className={`text-sm italic leading-[20px] ${isActive ? 'text-app-text' : 'text-app-subtle'}`}
        >
          {line.text}
        </Text>
        {hasAnnotations && onAnnotationPress && (
          <AnnotationBadge annotations={annotations} seqIdx={seqIdx} onPress={onAnnotationPress} />
        )}
      </View>
    );
  }

  return (
    <View className={`px-4 py-2.5 mx-2 rounded-lg ${isActive ? 'bg-app-card' : ''}`}>
      {line.character ? (
        <Text
          className={`text-[11px] font-bold uppercase tracking-[1px] mb-0.5 ${
            isActive ? 'text-app-accent' : 'text-app-subtle'
          }`}
        >
          {line.character}
        </Text>
      ) : null}
      <Text
        className={`text-[15px] leading-[22px] ${
          isActive ? 'text-white font-medium' : 'text-app-muted'
        }`}
      >
        {line.text}
      </Text>
      {hasAnnotations && onAnnotationPress && (
        <AnnotationBadge annotations={annotations} seqIdx={seqIdx} onPress={onAnnotationPress} />
      )}
      {!hasAnnotations && onAnnotationPress && (
        <Pressable
          onPress={() => onAnnotationPress(seqIdx, [])}
          hitSlop={8}
          className="self-start px-1.5 py-0.5 rounded mt-0.5 bg-transparent"
        >
          <Text className="text-[10px] text-app-subtle opacity-0">+</Text>
        </Pressable>
      )}
    </View>
  );
}
