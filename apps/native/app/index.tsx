import { useReducer } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FileSystem = require('expo-file-system/legacy') as {
  readAsStringAsync: (uri: string) => Promise<string>;
};
import { usePlays } from '@/hooks/usePlays';
import { useUploadScript, useDeleteScript } from '@/hooks/useScripts';
import { theatricoClient } from '@/services/api/theatricoClient';
import type { Play } from '@/domain';

// ─── ScriptUploadSheet ────────────────────────────────────────────────────────

type PickState = {
  uri: string | null;
  name: string;
  title: string;
  preview: string;
};

type PickAction =
  | { type: 'pick'; uri: string; name: string; title: string }
  | { type: 'set_preview'; preview: string }
  | { type: 'set_title'; title: string }
  | { type: 'reset' };

const pickInitial: PickState = { uri: null, name: '', title: '', preview: '' };

function pickReducer(state: PickState, action: PickAction): PickState {
  switch (action.type) {
    case 'pick': return { ...state, uri: action.uri, name: action.name, title: action.title, preview: '' };
    case 'set_preview': return { ...state, preview: action.preview };
    case 'set_title': return { ...state, title: action.title };
    case 'reset': return pickInitial;
  }
}

function ScriptUploadSheet({
  visible,
  onClose,
  onUploaded,
}: {
  visible: boolean;
  onClose: () => void;
  onUploaded: (id: string) => void;
}) {
  const [pick, dispatch] = useReducer(pickReducer, pickInitial);
  const upload = useUploadScript();

  async function pickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/markdown', 'text/plain'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (!asset.name.endsWith('.md')) {
        Alert.alert('Invalid file', 'Only .md (Markdown) files are supported.');
        return;
      }
      dispatch({ type: 'pick', uri: asset.uri, name: asset.name, title: asset.name.replace(/\.md$/i, '') });
      const content = await FileSystem.readAsStringAsync(asset.uri);
      dispatch({ type: 'set_preview', preview: content.slice(0, 1500) + (content.length > 1500 ? '\n\n… (truncated)' : '') });
    } catch {
      Alert.alert('Error', 'Could not open file picker.');
    }
  }

  function handleUpload() {
    if (!pick.uri || !pick.title.trim()) return;
    upload.mutate(
      { uri: pick.uri, fileName: pick.name, title: pick.title.trim() },
      {
        onSuccess: (data) => { onUploaded(data.id); dispatch({ type: 'reset' }); upload.reset(); },
        onError: (e) => Alert.alert('Upload failed', e instanceof Error ? e.message : 'Unknown error'),
      },
    );
  }

  function handleClose() {
    dispatch({ type: 'reset' });
    upload.reset();
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View className="flex-1 bg-app-dark px-5 pt-6 pb-8 gap-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-lg font-bold text-app-text">Upload Script</Text>
          <Pressable onPress={handleClose}>
            <Text className="text-app-muted text-[28px] leading-none">×</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={pickFile}
          className={`rounded-xl py-[14px] items-center border-2 ${
            pick.uri ? 'border-green-600 bg-green-900/20' : 'border-dashed border-app-accent/50 bg-app-card'
          }`}
        >
          <Text className={`text-[15px] font-semibold ${pick.uri ? 'text-green-400' : 'text-app-text'}`}>
            {pick.uri ? `✓  ${pick.name}` : '📄  Pick .md File…'}
          </Text>
        </Pressable>

        {pick.uri && (
          <View className="gap-1.5">
            <Text className="text-[13px] text-app-muted">Title</Text>
            <TextInput
              value={pick.title}
              onChangeText={(t) => dispatch({ type: 'set_title', title: t })}
              placeholder="Script title"
              placeholderTextColor="#6b5e6e"
              className="bg-app-input rounded-xl px-4 py-3 text-app-text text-[15px] border border-transparent focus:border-app-accent"
            />
          </View>
        )}

        {pick.preview ? (
          <View className="flex-1 gap-1">
            <Text className="text-[13px] text-app-muted">Preview</Text>
            <ScrollView className="flex-1 bg-app-card rounded-xl p-3">
              <Text className="text-xs text-app-muted font-mono leading-relaxed">{pick.preview}</Text>
            </ScrollView>
          </View>
        ) : (
          <View className="flex-1" />
        )}

        <Pressable
          className={`rounded-xl py-[14px] items-center bg-app-accent ${
            !pick.uri || !pick.title.trim() || upload.isPending ? 'opacity-40' : ''
          }`}
          onPress={handleUpload}
          disabled={!pick.uri || !pick.title.trim() || upload.isPending}
        >
          {upload.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text className="text-white text-[15px] font-bold">Upload Script</Text>
          )}
        </Pressable>
      </View>
    </Modal>
  );
}

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

type UIState = {
  selectedPlayId: string | null;
  modal: 'upload' | 'manage' | null;
};

type UIAction =
  | { type: 'select_play'; id: string | null }
  | { type: 'open_modal'; modal: 'upload' | 'manage' }
  | { type: 'close_modal' };

function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case 'select_play': return { ...state, selectedPlayId: action.id };
    case 'open_modal': return { ...state, modal: action.modal };
    case 'close_modal': return { ...state, modal: null };
  }
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: plays, isLoading: playsLoading, error: playsError } = usePlays();
  const deleteScript = useDeleteScript();
  const { creating, error: createError, create } = useCreateSession(
    (code) => router.push({ pathname: '/operator', params: { code } }),
  );
  const [ui, dispatch] = useReducer(uiReducer, { selectedPlayId: null, modal: null });

  const selectedPlay = plays?.find((p) => p.id === ui.selectedPlayId) ?? null;
  const uploadablePlays = plays?.filter((p) => p.id !== 'default') ?? [];

  function handleDelete(play: Play) {
    Alert.alert('Delete Script', `Delete "${play.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteScript.mutate(play.id, {
            onSuccess: () => {
              if (ui.selectedPlayId === play.id) dispatch({ type: 'select_play', id: null });
            },
            onError: (e) => Alert.alert('Error', e instanceof Error ? e.message : 'Delete failed'),
          });
        },
      },
    ]);
  }

  return (
    <>
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
            <View className="flex-row gap-2">
              {uploadablePlays.length > 0 && (
                <Pressable
                  onPress={() => dispatch({ type: 'open_modal', modal: 'manage' })}
                  className="px-3 py-1.5 rounded-lg bg-app-input"
                >
                  <Text className="text-[12px] text-app-label font-semibold">Manage</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => dispatch({ type: 'open_modal', modal: 'upload' })}
                className="px-3 py-1.5 rounded-lg bg-app-accent/20 border border-app-accent/40"
              >
                <Text className="text-[12px] text-app-accent font-semibold">+ Upload</Text>
              </Pressable>
            </View>
          </View>

          {playsLoading ? (
            <ActivityIndicator color="#b31e35" className="my-3" />
          ) : playsError ? (
            <Text className="text-[13px] text-app-accent">
              Could not load plays. Check your connection.
            </Text>
          ) : !plays?.length ? (
            <Text className="text-[13px] text-app-subtle italic">No plays available. Upload a script to get started.</Text>
          ) : (
            <View className="gap-1.5">
              {plays.map((play) => {
                const isSelected = ui.selectedPlayId === play.id;
                return (
                  <Pressable
                    key={play.id}
                    onPress={() => dispatch({ type: 'select_play', id: play.id })}
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
        </View>

        {/* Script management inline */}
        {ui.modal === 'manage' && uploadablePlays.length > 0 && (
          <View className="bg-app-card rounded-2xl p-[18px] gap-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-[13px] font-bold text-app-label uppercase tracking-[1px]">
                Scripts
              </Text>
              <Pressable onPress={() => dispatch({ type: 'close_modal' })}>
                <Text className="text-app-muted text-[20px] leading-none">×</Text>
              </Pressable>
            </View>
            {uploadablePlays.map((play) => (
              <View
                key={play.id}
                className="flex-row items-center justify-between bg-app-input rounded-[10px] px-3 py-2.5"
              >
                <Text className="text-[14px] text-app-text flex-1 mr-2" numberOfLines={1}>
                  {play.title}
                </Text>
                <Pressable
                  onPress={() => handleDelete(play)}
                  disabled={deleteScript.isPending}
                  className="px-2 py-1 rounded bg-[#3a0000]"
                >
                  <Text className="text-[12px] text-[#ff6666] font-semibold">Delete</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

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

      <ScriptUploadSheet
        visible={ui.modal === 'upload'}
        onClose={() => dispatch({ type: 'close_modal' })}
        onUploaded={(id) => {
          dispatch({ type: 'close_modal' });
          dispatch({ type: 'select_play', id });
        }}
      />
    </>
  );
}
