import { useEffect, useState } from 'react';
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

function ScriptUploadSheet({
  visible,
  onClose,
  onUploaded,
}: {
  visible: boolean;
  onClose: () => void;
  onUploaded: (id: string) => void;
}) {
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [pickedName, setPickedName] = useState('');
  const [title, setTitle] = useState('');
  const [preview, setPreview] = useState('');
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
      setPickedUri(asset.uri);
      setPickedName(asset.name);
      setTitle(asset.name.replace(/\.md$/i, ''));
      const content = await FileSystem.readAsStringAsync(asset.uri);
      setPreview(content.slice(0, 1500) + (content.length > 1500 ? '\n\n… (truncated)' : ''));
    } catch {
      Alert.alert('Error', 'Could not open file picker.');
    }
  }

  function handleUpload() {
    if (!pickedUri || !title.trim()) return;
    upload.mutate(
      { uri: pickedUri, fileName: pickedName, title: title.trim() },
      {
        onSuccess: (data) => {
          onUploaded(data.id);
          reset();
        },
        onError: (e) => {
          Alert.alert('Upload failed', e instanceof Error ? e.message : 'Unknown error');
        },
      },
    );
  }

  function reset() {
    setPickedUri(null);
    setPickedName('');
    setTitle('');
    setPreview('');
    upload.reset();
  }

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View className="flex-1 bg-app-dark px-5 pt-6 pb-8 gap-4">
        {/* Header */}
        <View className="flex-row items-center justify-between">
          <Text className="text-lg font-bold text-app-text">Upload Script</Text>
          <Pressable onPress={handleClose}>
            <Text className="text-app-muted text-[28px] leading-none">×</Text>
          </Pressable>
        </View>

        {/* Pick button */}
        <Pressable
          onPress={pickFile}
          className={`rounded-xl py-[14px] items-center border-2 ${
            pickedUri ? 'border-green-600 bg-green-900/20' : 'border-dashed border-app-accent/50 bg-app-card'
          }`}
        >
          <Text className={`text-[15px] font-semibold ${pickedUri ? 'text-green-400' : 'text-app-text'}`}>
            {pickedUri ? `✓  ${pickedName}` : '📄  Pick .md File…'}
          </Text>
        </Pressable>

        {/* Title input */}
        {pickedUri && (
          <View className="gap-1.5">
            <Text className="text-[13px] text-app-muted">Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Script title"
              placeholderTextColor="#6b5e6e"
              className="bg-app-input rounded-xl px-4 py-3 text-app-text text-[15px] border border-transparent focus:border-app-accent"
            />
          </View>
        )}

        {/* Preview */}
        {preview ? (
          <View className="flex-1 gap-1">
            <Text className="text-[13px] text-app-muted">Preview</Text>
            <ScrollView className="flex-1 bg-app-card rounded-xl p-3">
              <Text className="text-xs text-app-muted font-mono leading-relaxed">{preview}</Text>
            </ScrollView>
          </View>
        ) : (
          <View className="flex-1" />
        )}

        {/* Upload button */}
        <Pressable
          className={`rounded-xl py-[14px] items-center ${
            !pickedUri || !title.trim() || upload.isPending ? 'bg-app-accent opacity-40' : 'bg-app-accent'
          }`}
          onPress={handleUpload}
          disabled={!pickedUri || !title.trim() || upload.isPending}
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

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: plays, isLoading: playsLoading, error: playsError } = usePlays();
  const deleteScript = useDeleteScript();

  const [selectedPlay, setSelectedPlay] = useState<Play | null>(null);
  const [pendingSelectId, setPendingSelectId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showManage, setShowManage] = useState(false);

  const uploadablePlays = plays?.filter((p) => p.id !== 'default') ?? [];

  useEffect(() => {
    if (pendingSelectId && plays) {
      const found = plays.find((p) => p.id === pendingSelectId);
      if (found) {
        setSelectedPlay(found);
        setPendingSelectId(null);
      }
    }
  }, [plays, pendingSelectId]);

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

  function handleDelete(play: Play) {
    Alert.alert('Delete Script', `Delete "${play.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteScript.mutate(play.id, {
            onSuccess: () => {
              if (selectedPlay?.id === play.id) setSelectedPlay(null);
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
                  onPress={() => setShowManage(true)}
                  className="px-3 py-1.5 rounded-lg bg-app-input"
                >
                  <Text className="text-[12px] text-app-label font-semibold">Manage</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => setShowUpload(true)}
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
                const isSelected = selectedPlay?.id === play.id;
                return (
                  <Pressable
                    key={play.id}
                    onPress={() => setSelectedPlay(play)}
                    className={`rounded-[10px] p-3 border ${
                      isSelected
                        ? 'bg-[#2a0f1a] border-app-accent'
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

        {/* Script management inline */}
        {showManage && uploadablePlays.length > 0 && (
          <View className="bg-app-card rounded-2xl p-[18px] gap-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-[13px] font-bold text-app-label uppercase tracking-[1px]">
                Scripts
              </Text>
              <Pressable onPress={() => setShowManage(false)}>
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
        visible={showUpload}
        onClose={() => setShowUpload(false)}
        onUploaded={(id) => {
          setShowUpload(false);
          setPendingSelectId(id);
        }}
      />
    </>
  );
}
