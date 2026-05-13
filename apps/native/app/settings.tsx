import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useSettings,
  SUPPORTED_LANGUAGES,
  type RecognizerPreference,
  type WhisperModelSize,
} from '@/context/SettingsContext';

function SectionHeader({ label }: { label: string }) {
  return (
    <Text className="text-[10px] text-app-tertiary font-bold tracking-[1px] pl-0.5 mb-1.5">
      {label}
    </Text>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View className="flex-row overflow-hidden bg-app-input rounded-xl">
      {options.map((opt) => (
        <Pressable
          key={opt.value}
          onPress={() => onChange(opt.value)}
          className={`flex-1 py-2.5 items-center ${value === opt.value ? 'bg-app-accent' : ''}`}
        >
          <Text
            className={`text-sm font-semibold ${
              value === opt.value ? 'text-white' : 'text-app-muted'
            }`}
          >
            {opt.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function OptionRow<T extends string>({
  label,
  value,
  selected,
  onSelect,
}: {
  label: string;
  value: T;
  selected: boolean;
  onSelect: (v: T) => void;
}) {
  return (
    <Pressable
      onPress={() => onSelect(value)}
      className={`flex-row items-center justify-between rounded-[10px] px-4 py-3 border ${
        selected ? 'bg-[#1a0a20] border-app-accent' : 'bg-app-input border-transparent'
      }`}
    >
      <Text className={`text-sm ${selected ? 'text-app-accent font-semibold' : 'text-app-text'}`}>
        {label}
      </Text>
      {selected ? <Text className="text-app-accent">✓</Text> : null}
    </Pressable>
  );
}

function isValidBackendUrl(url: string): boolean {
  return /^(https?|wss?):\/\/.+/.test(url.trim());
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useSettings();

  const [urlDraft, setUrlDraft] = useState(settings.backendUrl);
  const [urlError, setUrlError] = useState<string | null>(null);
  const urlInputRef = useRef<TextInput>(null);

  const handleUrlBlur = () => {
    const trimmed = urlDraft.trim();
    if (!isValidBackendUrl(trimmed)) {
      setUrlError('Must start with http://, https://, ws://, or wss://');
      return;
    }
    setUrlError(null);
    updateSettings({ backendUrl: trimmed });
  };

  const handleRecognizerChange = (v: RecognizerPreference) => {
    updateSettings({ recognizerPreference: v });
  };

  const handleModelSizeChange = (v: WhisperModelSize) => {
    updateSettings({ whisperModelSize: v });
    Alert.alert(
      'Model Changed',
      'The new model will be downloaded the next time you switch to Whisper.',
      [{ text: 'OK' }],
    );
  };

  const handleLanguageChange = (code: string) => {
    updateSettings({ language: code });
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Settings', headerShown: true }} />
      <ScrollView
        className="flex-1 bg-app-dark"
        contentContainerClassName="px-4 gap-6"
        contentContainerStyle={{ paddingTop: 24, paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Backend URL */}
        <View className="gap-2">
          <SectionHeader label="BACKEND" />
          <View className="gap-3 p-4 bg-app-card rounded-2xl">
            <Text className="text-app-label text-[13px]">Backend URL</Text>
            <TextInput
              ref={urlInputRef}
              className="bg-app-input rounded-xl px-4 py-3 text-app-text text-[15px]"
              value={urlDraft}
              onChangeText={(t) => {
                setUrlDraft(t);
                setUrlError(null);
              }}
              onBlur={handleUrlBlur}
              onSubmitEditing={handleUrlBlur}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              placeholder="https://theatrico.fly.dev"
              placeholderTextColor="#555577"
            />
            {urlError ? <Text className="text-app-accent text-[12px]">{urlError}</Text> : null}
            <Text className="text-app-tertiary text-[12px]">
              Accepts http://, https://, ws://, or wss:// prefixes.
            </Text>
          </View>
        </View>

        {/* Recognizer preference */}
        <View className="gap-2">
          <SectionHeader label="SPEECH RECOGNIZER" />
          <View className="gap-3 p-4 bg-app-card rounded-2xl">
            <Text className="text-app-label text-[13px]">Preferred engine</Text>
            <SegmentedControl<RecognizerPreference>
              options={[
                { value: 'native', label: 'Native (iOS)' },
                { value: 'whisper', label: 'Whisper' },
              ]}
              value={settings.recognizerPreference}
              onChange={handleRecognizerChange}
            />
            <Text className="text-app-tertiary text-[12px]">
              Native uses Apple SFSpeechRecognizer (requires internet). Whisper runs on-device.
            </Text>
          </View>
        </View>

        {/* Whisper model size */}
        <View className="gap-2">
          <SectionHeader label="WHISPER MODEL" />
          <View className="gap-2 p-4 bg-app-card rounded-2xl">
            {(
              [
                {
                  value: 'tiny' as WhisperModelSize,
                  label: 'Tiny — 75 MB (fastest, lower accuracy)',
                },
                { value: 'base' as WhisperModelSize, label: 'Base — 142 MB (balanced)' },
                {
                  value: 'small' as WhisperModelSize,
                  label: 'Small — 466 MB (slower, higher accuracy)',
                },
              ] as { value: WhisperModelSize; label: string }[]
            ).map((opt) => (
              <OptionRow
                key={opt.value}
                label={opt.label}
                value={opt.value}
                selected={settings.whisperModelSize === opt.value}
                onSelect={handleModelSizeChange}
              />
            ))}
            <Text className="text-app-tertiary text-[12px] mt-1">
              Models are cached after the first download. Changing size clears the old model.
            </Text>
          </View>
        </View>

        {/* Language */}
        <View className="gap-2">
          <SectionHeader label="RECOGNITION LANGUAGE" />
          <View className="gap-2 p-4 bg-app-card rounded-2xl">
            {SUPPORTED_LANGUAGES.map((lang) => (
              <OptionRow
                key={lang.code}
                label={lang.label}
                value={lang.code}
                selected={settings.language === lang.code}
                onSelect={handleLanguageChange}
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </>
  );
}
