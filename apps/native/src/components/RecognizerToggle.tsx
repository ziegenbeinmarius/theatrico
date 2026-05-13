import { Pressable, Text, View } from 'react-native';

interface Props {
  value: 'whisper' | 'native';
  onChange: (value: 'whisper' | 'native') => void;
  disabled?: boolean;
}

const OPTIONS: { label: string; value: 'whisper' | 'native' }[] = [
  { label: 'Whisper', value: 'whisper' },
  { label: 'Native', value: 'native' },
];

export function RecognizerToggle({ value, onChange, disabled = false }: Props) {
  return (
    <View className="flex-row bg-app-input rounded-[10px] p-[3px] gap-[3px]">
      {OPTIONS.map((opt) => {
        const isActive = value === opt.value;

        return (
          <Pressable
            key={opt.value}
            onPress={() => !disabled && onChange(opt.value)}
            className={`flex-1 py-2 px-3 rounded-lg items-center ${
              isActive ? 'bg-app-accent' : ''
            } ${disabled ? 'opacity-40' : ''}`}
          >
            <Text
              className={`text-[13px] font-semibold ${
                isActive ? 'text-white' : disabled ? 'text-app-subtle' : 'text-app-muted'
              }`}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
