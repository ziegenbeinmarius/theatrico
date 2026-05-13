import { Text, View } from 'react-native';
import type { FlatLine } from '@/lib/scriptUtils';

export type ScriptListItem =
  | { type: 'act_header'; id: string; title: string }
  | { type: 'scene_header'; id: string; title: string }
  | { type: 'line'; id: string; flatLine: FlatLine; isActive: boolean };

interface Props {
  item: ScriptListItem;
}

export function LineItem({ item }: Props) {
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

  const { flatLine, isActive } = item;
  const { line } = flatLine;

  if (line.type === 'stage_direction' || line.type === 'action') {
    return (
      <View className={`px-4 py-2 mx-2 rounded-lg ${isActive ? 'bg-app-card' : ''}`}>
        <Text
          className={`text-sm italic leading-[20px] ${isActive ? 'text-app-text' : 'text-app-subtle'}`}
        >
          {line.text}
        </Text>
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
    </View>
  );
}
