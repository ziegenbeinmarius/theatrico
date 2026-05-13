import { Pressable, Text, View } from 'react-native';

export interface CueInfo {
  id: number;
  content: string;
}

interface Props {
  cues: CueInfo[];
  onDismiss: (id: number) => void;
}

const CUE_ICONS: Record<string, string> = {
  lighting: '💡',
  sound: '🔊',
  stage_direction: '🎭',
  custom: '⚡',
};

function parseCue(content: string): { icon: string; label: string } {
  try {
    const parsed = JSON.parse(content) as { cue_type: string; description: string };
    return {
      icon: CUE_ICONS[parsed.cue_type] ?? '⚡',
      label: parsed.description,
    };
  } catch {
    return { icon: '⚡', label: content };
  }
}

export function CueBanner({ cues, onDismiss }: Props) {
  if (cues.length === 0) return null;

  return (
    <View className="gap-1.5">
      {cues.map((cue) => {
        const { icon, label } = parseCue(cue.content);
        return (
          <View
            key={cue.id}
            className="flex-row items-center gap-2 px-3 py-2.5 rounded-xl bg-[#2a1a00] border border-[#7a5500]"
          >
            <Text className="text-xl leading-none">{icon}</Text>
            <Text className="flex-1 text-[13px] text-[#f5c842] font-medium leading-[18px]">
              {label}
            </Text>
            <Pressable
              onPress={() => onDismiss(cue.id)}
              hitSlop={8}
              className="px-1"
            >
              <Text className="text-[#a08030] text-base leading-none">×</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
