import { useEffect, useReducer } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { usePlays } from '@/hooks/usePlays';
import { useSessions, useDeleteSession } from '@/hooks/useSessions';
import { theatricoClient } from '@/services/api/theatricoClient';
import type { Play } from '@/domain';

// ─── useCreateSession ─────────────────────────────────────────────────────────

type CreateState = { creating: boolean; error: string | null };
type CreateAction = { type: 'start' } | { type: 'done' } | { type: 'error'; message: string };

function createReducer(_: CreateState, action: CreateAction): CreateState {
  if (action.type === 'start') return { creating: true, error: null };
  if (action.type === 'done') return { creating: false, error: null };
  return { creating: false, error: action.message };
}

function useCreateSession(onSuccess: (code: string) => void) {
  const [state, dispatch] = useReducer(createReducer, { creating: false, error: null });

  async function create(playId: string) {
    dispatch({ type: 'start' });
    try {
      const session = await theatricoClient.createSession(playId);
      dispatch({ type: 'done' });
      onSuccess(session.code);
    } catch (e) {
      dispatch({ type: 'error', message: e instanceof Error ? e.message : 'Failed to create session' });
    }
  }

  return { ...state, create };
}

// ─── HomeScreen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, loading: authLoading } = useAuth();
  const { data: plays, isLoading: playsLoading, error: playsError } = usePlays();
  const { creating, error: createError, create } = useCreateSession(
    (code) => router.push({ pathname: '/operator', params: { code } }),
  );
  const [selectedPlayId, setSelectedPlayId] = useReducer((_: string | null, v: string | null) => v, null);
  const { data: sessions, isLoading: sessionsLoading } = useSessions();
  const { mutate: deleteSession } = useDeleteSession();

  useEffect(() => {
    if (!authLoading && !token) {
      router.replace('/operator/login');
    }
  }, [authLoading, token, router]);

  const selectedPlay = plays?.find((p) => p.id === selectedPlayId) ?? null;

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
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-[13px] font-bold text-app-label uppercase tracking-[1px]">
              Operator
            </Text>
            <Text className="text-[13px] text-app-tertiary mt-0.5">
              Select a play and start a session
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/scripts')}
            className="px-3 py-1.5 rounded-lg bg-app-accent/20 border border-app-accent/40"
          >
            <Text className="text-[12px] text-app-accent font-semibold">Script Library</Text>
          </Pressable>
        </View>

        {playsLoading ? (
          <ActivityIndicator color="#b31e35" className="my-3" />
        ) : playsError ? (
          <Text className="text-[13px] text-app-accent">
            Could not load plays. Check your connection.
          </Text>
        ) : !plays?.length ? (
          <Text className="text-[13px] text-app-subtle italic">
            No plays available. Go to Script Library to upload a script.
          </Text>
        ) : (
          <View className="gap-1.5">
            {plays.map((play: Play) => {
              const isSelected = selectedPlayId === play.id;
              return (
                <Pressable
                  key={play.id}
                  onPress={() => setSelectedPlayId(play.id)}
                  className={`rounded-[10px] p-3 border ${
                    isSelected ? 'bg-[#2a0f1a] border-app-accent' : 'bg-app-input border-transparent'
                  }`}
                >
                  <Text className={`text-[15px] font-semibold ${isSelected ? 'text-app-accent' : 'text-app-text'}`}>
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
          className={`bg-app-accent rounded-xl py-[14px] items-center ${!selectedPlay || creating ? 'opacity-40' : ''}`}
          onPress={() => { if (selectedPlay) create(selectedPlay.id); }}
          disabled={!selectedPlay || creating}
        >
          {creating ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text className="text-white text-[15px] font-bold">Create Session →</Text>
          )}
        </Pressable>

        {/* Active sessions */}
        {sessionsLoading ? null : sessions && sessions.length > 0 ? (
          <View className="gap-1.5">
            <Text className="text-[12px] font-bold text-app-label uppercase tracking-[1px] mt-1">
              Active Sessions
            </Text>
            {sessions.map((s) => (
              <Pressable
                key={s.join_code}
                className="flex-row items-center rounded-[10px] bg-app-input px-3 py-2.5 gap-2"
                onPress={() => router.push({ pathname: '/operator', params: { code: s.join_code } })}
              >
                <View className="flex-1">
                  <Text className="text-[14px] font-semibold text-app-text" numberOfLines={1}>
                    {s.script_title || s.script_id}
                  </Text>
                  <Text className="text-[12px] text-app-muted tracking-[2px]">{s.join_code}</Text>
                </View>
                <Pressable
                  hitSlop={8}
                  onPress={() =>
                    Alert.alert('Delete Session', `Remove session ${s.join_code}?`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => deleteSession(s.join_code) },
                    ])
                  }
                >
                  <Text className="text-app-accent text-[18px] font-bold">✕</Text>
                </Pressable>
              </Pressable>
            ))}
          </View>
        ) : null}
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
