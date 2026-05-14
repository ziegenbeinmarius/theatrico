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

const CUE_ICON: Record<string, string> = {
  lighting: '💡',
  sound: '🔊',
  stage_direction: '🎭',
  custom: '⚡',
};

function parseCue(raw: string): { cue_type: string; description: string } {
  try {
    return JSON.parse(raw);
  } catch {
    return { cue_type: 'custom', description: raw };
  }
}

export function AnnotationRow({
  annotation,
  onPress,
}: {
  annotation: Annotation;
  onPress?: () => void;
}) {
  const isCue = annotation.type === 'cue';
  let icon: string;
  let label: string;
  let textClass: string;
  let bgClass: string;

  if (isCue) {
    const cue = parseCue(annotation.content);
    icon = CUE_ICON[cue.cue_type] ?? '⚡';
    label = `${cue.cue_type.replace(/_/g, ' ')} · ${cue.description}`;
    textClass = 'text-[#f5c842]';
    bgClass = 'bg-[#2a1f00]';
  } else {
    icon = '📝';
    label = annotation.content;
    textClass = 'text-[#9fb4ff]';
    bgClass = 'bg-[#0d1530]';
  }

  const inner = (
    <View className={`flex-row items-start gap-1.5 px-2 py-1 rounded-md ${bgClass}`}>
      <Text className="text-[11px] mt-px">{icon}</Text>
      <Text className={`flex-1 text-[11px] leading-[16px] ${textClass}`} numberOfLines={4}>
        {label}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} hitSlop={4}>
        {inner}
      </Pressable>
    );
  }
  return inner;
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
        <Text className={`text-sm italic leading-[20px] ${isActive ? 'text-app-text' : 'text-app-subtle'}`}>
          {line.text}
        </Text>
        {hasAnnotations && (
          <View className="mt-1 gap-0.5">
            {annotations.map((a) => (
              <AnnotationRow
                key={a.id}
                annotation={a}
                onPress={onAnnotationPress ? () => onAnnotationPress(seqIdx, annotations) : undefined}
              />
            ))}
          </View>
        )}
        {!hasAnnotations && onAnnotationPress && (
          <Pressable
            onPress={() => onAnnotationPress(seqIdx, [])}
            hitSlop={8}
            className="self-start px-1.5 py-0.5 rounded mt-0.5 bg-app-card border border-[#3d2430]"
          >
            <Text className="text-[10px] text-app-subtle">+ Add annotation</Text>
          </Pressable>
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
      {hasAnnotations && (
        <View className="mt-1 gap-0.5">
          {annotations.map((a) => (
            <AnnotationRow
              key={a.id}
              annotation={a}
              onPress={onAnnotationPress ? () => onAnnotationPress(seqIdx, annotations) : undefined}
            />
          ))}
        </View>
      )}
      {!hasAnnotations && onAnnotationPress && (
        <Pressable
          onPress={() => onAnnotationPress(seqIdx, [])}
          hitSlop={8}
          className="self-start px-1.5 py-0.5 rounded mt-0.5 bg-app-card border border-[#3d2430]"
        >
          <Text className="text-[10px] text-app-subtle">+ Add annotation</Text>
        </Pressable>
      )}
    </View>
  );
}
