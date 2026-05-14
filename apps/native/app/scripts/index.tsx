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
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FileSystem = require('expo-file-system/legacy') as {
  readAsStringAsync: (uri: string) => Promise<string>;
};
import { usePlays } from '@/hooks/usePlays';
import { useUploadScript, useDeleteScript } from '@/hooks/useScripts';
import type { Play } from '@/domain';

// ─── Upload sheet (same as home screen) ──────────────────────────────────────

type PickState = { uri: string | null; name: string; title: string; preview: string };
type PickAction =
  | { type: 'pick'; uri: string; name: string; title: string }
  | { type: 'set_preview'; preview: string }
  | { type: 'set_title'; title: string }
  | { type: 'reset' };

type DocumentPickerAsset = {
  uri: string;
  name: string;
};

type DocumentPickerResult =
  | { canceled: true; assets?: undefined }
  | { canceled: false; assets: DocumentPickerAsset[] };

type DocumentPickerModule = {
  getDocumentAsync: (options: {
    type?: string[];
    copyToCacheDirectory?: boolean;
  }) => Promise<DocumentPickerResult>;
};

const pickInitial: PickState = { uri: null, name: '', title: '', preview: '' };

function getDocumentPickerModule(): DocumentPickerModule | null {
  try {
    // Some native builds may not include this module yet. Lazy-load it so the route still mounts.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-document-picker') as DocumentPickerModule;
  } catch {
    return null;
  }
}

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
    const documentPicker = getDocumentPickerModule();
    if (!documentPicker) {
      Alert.alert(
        'Document picker unavailable',
        'This native build does not include expo-document-picker yet. Rebuild or reinstall the app, then try again.',
      );
      return;
    }

    try {
      const result = await documentPicker.getDocumentAsync({
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
      dispatch({
        type: 'set_preview',
        preview: content.slice(0, 1500) + (content.length > 1500 ? '\n\n… (truncated)' : ''),
      });
    } catch {
      Alert.alert('Error', 'Could not open file picker.');
    }
  }

  function handleUpload() {
    if (!pick.uri || !pick.title.trim()) return;
    upload.mutate(
      { uri: pick.uri, fileName: pick.name, title: pick.title.trim() },
      {
        onSuccess: (data) => {
          onUploaded(data.id);
          dispatch({ type: 'reset' });
          upload.reset();
        },
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

// ─── ScriptsScreen ────────────────────────────────────────────────────────────

export default function ScriptsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: plays, isLoading, error } = usePlays();
  const deleteScript = useDeleteScript();
  const [showUpload, setShowUpload] = useReducer((s: boolean, v: boolean) => v, false);

  const scripts = (plays ?? []).filter((p: Play) => p.id !== 'default');

  function handleDelete(play: Play) {
    Alert.alert('Delete Script', `Delete "${play.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          deleteScript.mutate(play.id, {
            onError: (e) => Alert.alert('Error', e instanceof Error ? e.message : 'Delete failed'),
          }),
      },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Script Library' }} />
      <ScrollView
        className="flex-1 bg-app-dark"
        contentContainerClassName="flex-grow px-5 gap-5"
        contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-2xl font-bold text-app-text">Script Library</Text>
            <Text className="text-[13px] text-app-muted mt-0.5">Upload scripts and edit annotations</Text>
          </View>
          <Pressable
            onPress={() => setShowUpload(true)}
            className="px-4 py-2 rounded-xl bg-app-accent"
          >
            <Text className="text-white text-[13px] font-bold">+ Upload</Text>
          </Pressable>
        </View>

        {/* List */}
        <View className="bg-app-card rounded-2xl overflow-hidden">
          {isLoading ? (
            <ActivityIndicator color="#b31e35" className="my-6" />
          ) : error ? (
            <Text className="text-[13px] text-app-accent px-4 py-5">Failed to load scripts.</Text>
          ) : scripts.length === 0 ? (
            <View className="items-center py-10 gap-3">
              <Text className="text-[13px] text-app-muted">No scripts yet.</Text>
              <Pressable
                onPress={() => setShowUpload(true)}
                className="px-4 py-2.5 rounded-xl bg-app-accent"
              >
                <Text className="text-white text-[13px] font-bold">Upload your first script</Text>
              </Pressable>
            </View>
          ) : (
            scripts.map((play: Play, i: number) => (
              <View
                key={play.id}
                className={`flex-row items-center px-4 py-3 gap-3 ${
                  i < scripts.length - 1 ? 'border-b border-[#2a1a20]' : ''
                }`}
              >
                <Text className="flex-1 text-[15px] font-medium text-app-text" numberOfLines={1}>
                  {play.title}
                </Text>
                <Pressable
                  onPress={() => router.push({ pathname: '/scripts/[id]', params: { id: play.id } })}
                  className="px-3 py-1.5 rounded-lg bg-app-input"
                >
                  <Text className="text-[12px] text-app-label font-semibold">Edit</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleDelete(play)}
                  disabled={deleteScript.isPending}
                  className="px-3 py-1.5 rounded-lg bg-[#3a0000] disabled:opacity-40"
                >
                  <Text className="text-[12px] text-[#ff6666] font-semibold">Delete</Text>
                </Pressable>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <ScriptUploadSheet
        visible={showUpload}
        onClose={() => setShowUpload(false)}
        onUploaded={() => setShowUpload(false)}
      />
    </>
  );
}
