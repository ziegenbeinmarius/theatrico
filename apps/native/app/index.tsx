import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlays } from '@/hooks/usePlays';
import { theatricoClient } from '@/services/api/theatricoClient';
import type { Play } from '@/domain';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: plays, isLoading: playsLoading, error: playsError } = usePlays();

  const [selectedPlay, setSelectedPlay] = useState<Play | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreateSession = async () => {
    if (!selectedPlay) return;
    setCreating(true);
    setCreateError(null);
    try {
      const session = await theatricoClient.createSession(selectedPlay.id);
      router.push({ pathname: '/operator', params: { code: session.code } });
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create session');
    } finally {
      setCreating(false);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-app-dark"
      contentContainerClassName="flex-grow px-5 gap-5"
      contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text className="text-[42px] font-bold text-app-text text-center tracking-[2px]">
        Theatrico
      </Text>
      <Text className="text-sm text-app-muted text-center tracking-[4px] mb-2">
        Script Prompter
      </Text>

      {/* Operator section */}
      <View className="bg-app-card rounded-2xl p-[18px] gap-3">
        <Text className="text-[13px] font-bold text-app-label uppercase tracking-[1px]">
          Operator
        </Text>
        <Text className="text-[13px] text-app-tertiary -mt-1.5">
          Select a play and start a session
        </Text>

        {playsLoading ? (
          <ActivityIndicator color="#e94560" className="my-3" />
        ) : playsError ? (
          <Text className="text-[13px] text-app-accent">
            Could not load plays. Check your connection.
          </Text>
        ) : !plays?.length ? (
          <Text className="text-[13px] text-app-subtle italic">No plays available.</Text>
        ) : (
          <View className="gap-1.5">
            {plays.map((play) => {
              const isSelected = selectedPlay?.id === play.id;
              return (
                <Pressable
                  key={play.id}
                  onPress={() => setSelectedPlay(play)}
                  className={`rounded-[10px] p-3 border ${
                    isSelected
                      ? 'bg-[#1a0a20] border-app-accent'
                      : 'bg-app-input border-transparent'
                  }`}
                >
                  <Text
                    className={`text-[15px] font-semibold ${
                      isSelected ? 'text-app-accent' : 'text-app-text'
                    }`}
                  >
                    {play.title}
                  </Text>
                  {play.description ? (
                    <Text className="text-xs text-app-muted mt-0.5" numberOfLines={1}>
                      {play.description}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}

        {createError ? <Text className="text-[13px] text-app-accent">{createError}</Text> : null}

        <Pressable
          className={`bg-app-accent rounded-xl py-[14px] items-center ${
            !selectedPlay || creating ? 'opacity-40' : ''
          }`}
          onPress={handleCreateSession}
          disabled={!selectedPlay || creating}
        >
          {creating ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text className="text-white text-[15px] font-bold">Create Session →</Text>
          )}
        </Pressable>
      </View>

      {/* Audience section */}
      <View className="bg-app-card rounded-2xl p-[18px] gap-3">
        <Text className="text-[13px] font-bold text-app-label uppercase tracking-[1px]">
          Audience
        </Text>
        <Text className="text-[13px] text-app-tertiary -mt-1.5">
          Enter a session code or scan the QR code from the operator screen
        </Text>
        <Pressable
          className="bg-app-accent rounded-xl py-[14px] items-center"
          onPress={() => router.push('/join')}
        >
          <Text className="text-white text-[15px] font-bold">Join as Audience →</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
