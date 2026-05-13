import { ActivityIndicator, Alert, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { useOperatorSession, type WsStatus } from '@/hooks/useOperatorSession';
import { RecognizerToggle } from '@/components/RecognizerToggle';
import { TranscriptLog } from '@/components/TranscriptLog';
import { ScriptPositionCard } from '@/components/ScriptPositionCard';
import { ModelDownloadSheet } from '@/components/ModelDownloadSheet';
import { useSpeechRecognizerContext } from '@/context/SpeechRecognizerContext';
import { useSettings, WHISPER_MODEL_URLS } from '@/context/SettingsContext';

const IPAD_BREAKPOINT = 768;

function ReconnectOverlay({ status }: { status: WsStatus }) {
  if (status !== 'reconnecting') return null;
  return (
    <View
      pointerEvents="none"
      className="absolute inset-0 z-10 items-center justify-center gap-3 bg-black/50"
    >
      <ActivityIndicator color="#e94560" size="large" />
      <Text className="text-base font-semibold text-app-text">Reconnecting…</Text>
    </View>
  );
}

function StatusBanner({
  wsStatus,
  apiError,
  onRetry,
}: {
  wsStatus: WsStatus;
  apiError: Error | null;
  onRetry: () => void;
}) {
  if (apiError) {
    return (
      <View className="bg-[#3a0000] rounded-lg py-2.5 px-3 flex-row items-center justify-between border-l-[3px] border-l-app-accent">
        <Text className="text-[#ff6666] text-[13px] font-semibold flex-1">
          Cannot reach backend — check your URL in Settings
        </Text>
        <Pressable onPress={onRetry} className="px-3 py-1 ml-2 rounded-lg bg-app-accent">
          <Text className="text-white text-[12px] font-bold">Retry</Text>
        </Pressable>
      </View>
    );
  }
  if (wsStatus === 'disconnected') {
    return (
      <View className="bg-[#3a1a00] rounded-lg py-2 px-3 border-l-[3px] border-l-app-accent">
        <Text className="text-[#ffaa55] text-[13px] font-semibold">
          ⚠ Connection lost — check your network and backend
        </Text>
      </View>
    );
  }
  return null;
}

function useWhisperModelCheck(modelSize: string) {
  const [needsDownload, setNeedsDownload] = useState(false);

  useEffect(() => {
    const info = WHISPER_MODEL_URLS[modelSize as keyof typeof WHISPER_MODEL_URLS];
    if (!info) return;
    const fileName = info.url.split('/').pop() ?? 'whisper-model.bin';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FileSystem = require('expo-file-system/legacy') as {
      cacheDirectory: string;
      getInfoAsync: (p: string) => Promise<{ exists: boolean }>;
    };
    const dest = `${FileSystem.cacheDirectory}${fileName}`;
    FileSystem.getInfoAsync(dest)
      .then((i) => setNeedsDownload(!i.exists))
      .catch(() => setNeedsDownload(false));
  }, [modelSize]);

  return needsDownload;
}

export default function OperatorScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isIPad = width > IPAD_BREAKPOINT;

  const { code } = useLocalSearchParams<{ code: string }>();
  const sessionCode = code ?? '';

  const { recognizer, switchRecognizer } = useSpeechRecognizerContext();
  const { settings } = useSettings();

  const {
    session,
    play,
    isLoading,
    isRecording,
    transcriptItems,
    currentPosition,
    wsStatus,
    error,
    startRecording,
    stopRecording,
    togglePause,
    movePrev,
    moveNext,
  } = useOperatorSession(sessionCode);

  const isPaused = session?.status === 'paused';

  const [showDownloadSheet, setShowDownloadSheet] = useState(false);
  const whisperNeedsDownload = useWhisperModelCheck(settings.whisperModelSize);

  useEffect(() => {
    if (settings.recognizerPreference === 'whisper' && whisperNeedsDownload) {
      setShowDownloadSheet(true);
    }
  }, [settings.recognizerPreference, whisperNeedsDownload]);

  const handleMicPress = async () => {
    try {
      if (isRecording) {
        await stopRecording();
      } else {
        await startRecording();
      }
    } catch (e) {
      Alert.alert(
        'Microphone Error',
        e instanceof Error ? e.message : 'Failed to access microphone',
      );
    }
  };

  const handleTogglePause = async () => {
    try {
      await togglePause();
    } catch {
      Alert.alert('Error', 'Failed to update session status');
    }
  };

  const handleMovePrev = async () => {
    try {
      await movePrev();
    } catch {}
  };

  const handleMoveNext = async () => {
    try {
      await moveNext();
    } catch {}
  };

  // iPad: side-by-side — script on left (wide), controls + transcript on right (narrow)
  if (isIPad) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Operator',
            headerShown: true,
            headerRight: () => (
              <Pressable onPress={() => router.push('/settings')} className="px-2 py-1 mr-1">
                <Text className="text-white text-[22px]">⚙</Text>
              </Pressable>
            ),
          }}
        />
        <View
          className="flex-1 flex-row gap-4 px-4 pt-3 bg-app-dark"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <ReconnectOverlay status={wsStatus} />

          {/* Left: full-height script */}
          <View className="flex-[3] gap-2">
            <View className="flex-row items-center gap-2.5 bg-app-card rounded-[10px] px-[14px] py-2">
              <Text className="text-[10px] text-app-tertiary font-bold tracking-[1px]">SESSION</Text>
              <Text className="text-lg text-app-text font-extrabold tracking-[4px]">{sessionCode}</Text>
            </View>
            <ScriptPositionCard play={play} position={currentPosition} lookahead={12} />
          </View>

          {/* Right: controls + transcript + mic */}
          <View className="w-[300px] gap-3">
            <StatusBanner
              wsStatus={wsStatus}
              apiError={error}
              onRetry={() => router.replace({ pathname: '/operator', params: { code: sessionCode } })}
            />

            {/* Cursor row */}
            <View className="flex-row gap-2">
              <Pressable className="flex-1 bg-app-card rounded-[10px] py-3 items-center" onPress={handleMovePrev}>
                <Text className="text-sm font-semibold text-app-label">← Prev</Text>
              </Pressable>
              <Pressable
                className={`flex-[1.4] rounded-[10px] py-3 items-center border ${isPaused ? 'bg-[#1a0a20] border-app-accent' : 'bg-app-card border-transparent'}`}
                onPress={handleTogglePause}
              >
                <Text className={`text-sm font-bold ${isPaused ? 'text-app-accent' : 'text-app-label'}`}>
                  {isPaused ? '▶ Resume' : '⏸ Pause'}
                </Text>
              </Pressable>
              <Pressable className="flex-1 bg-app-card rounded-[10px] py-3 items-center" onPress={handleMoveNext}>
                <Text className="text-sm font-semibold text-app-label">Next →</Text>
              </Pressable>
            </View>

            {/* Recognizer toggle */}
            <RecognizerToggle
              value={recognizer.type}
              onChange={(type) => switchRecognizer(type)}
              disabled={isRecording}
            />

            {/* Transcript */}
            <View className="flex-1 min-h-[60px] overflow-hidden bg-app-card rounded-xl">
              <TranscriptLog items={transcriptItems} />
            </View>

            {/* Mic button */}
            <Pressable
              className={`flex-row rounded-[14px] py-[14px] items-center justify-center gap-2 border-2 ${isRecording ? 'bg-[#1a0a20] border-app-accent' : 'bg-app-card border-[#2a2a5a]'}`}
              onPress={handleMicPress}
            >
              <Text className="text-xl">{isRecording ? '⏹' : '🎙'}</Text>
              <Text className="text-base font-bold text-app-text">
                {isRecording ? 'Stop Mic' : 'Start Mic'}
              </Text>
            </Pressable>
          </View>
        </View>

        <ModelDownloadSheet
          visible={showDownloadSheet}
          modelSize={settings.whisperModelSize}
          onDismiss={() => setShowDownloadSheet(false)}
          onDownloadComplete={() => setShowDownloadSheet(false)}
        />
      </>
    );
  }

  // Phone: vertical layout — script takes most space
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Operator',
          headerShown: true,
          headerRight: () => (
            <Pressable onPress={() => router.push('/settings')} className="px-2 py-1 mr-1">
              <Text className="text-white text-[22px]">⚙</Text>
            </Pressable>
          ),
        }}
      />

      <View
        className="flex-1 gap-2.5 px-4 pt-3 bg-app-dark"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <ReconnectOverlay status={wsStatus} />

        {isLoading ? (
          <View className="items-center justify-center flex-1 gap-2">
            <ActivityIndicator color="#e94560" size="large" />
            <Text className="text-sm text-app-muted">Loading session…</Text>
          </View>
        ) : error && !session ? (
          <View className="items-center justify-center flex-1 gap-2">
            <Text className="text-base font-bold text-app-accent">Failed to load session</Text>
            <Text className="text-app-muted text-[13px]">{error.message}</Text>
          </View>
        ) : (
          <>
            <StatusBanner
              wsStatus={wsStatus}
              apiError={error}
              onRetry={() => router.replace({ pathname: '/operator', params: { code: sessionCode } })}
            />

            {/* Session code + recognizer toggle in one row */}
            <View className="flex-row items-center gap-2">
              <View className="flex-row items-center gap-2 bg-app-card rounded-[10px] px-3 py-2">
                <Text className="text-[10px] text-app-tertiary font-bold tracking-[1px]">SESSION</Text>
                <Text className="text-base text-app-text font-extrabold tracking-[3px]">{sessionCode}</Text>
              </View>
              <View className="flex-1">
                <RecognizerToggle
                  value={recognizer.type}
                  onChange={(type) => switchRecognizer(type)}
                  disabled={isRecording}
                />
              </View>
            </View>

            {/* Script card — takes most of the remaining space */}
            <View className="flex-[3]">
              <ScriptPositionCard play={play} position={currentPosition} lookahead={8} />
            </View>

            {/* Cursor controls */}
            <View className="flex-row gap-2">
              <Pressable
                className="flex-1 bg-app-card rounded-[10px] py-3 items-center"
                onPress={handleMovePrev}
              >
                <Text className="text-sm font-semibold text-app-label">← Prev</Text>
              </Pressable>
              <Pressable
                className={`flex-[1.4] rounded-[10px] py-3 items-center border ${
                  isPaused ? 'bg-[#1a0a20] border-app-accent' : 'bg-app-card border-transparent'
                }`}
                onPress={handleTogglePause}
              >
                <Text className={`text-sm font-bold ${isPaused ? 'text-app-accent' : 'text-app-label'}`}>
                  {isPaused ? '▶ Resume' : '⏸ Pause'}
                </Text>
              </Pressable>
              <Pressable
                className="flex-1 bg-app-card rounded-[10px] py-3 items-center"
                onPress={handleMoveNext}
              >
                <Text className="text-sm font-semibold text-app-label">Next →</Text>
              </Pressable>
            </View>

            {/* Transcript — compact */}
            <View className="flex-1 min-h-[60px] max-h-[120px] overflow-hidden bg-app-card rounded-xl">
              <TranscriptLog items={transcriptItems} />
            </View>

            {/* Mic button */}
            <Pressable
              className={`flex-row rounded-[14px] py-[14px] items-center justify-center gap-2 border-2 ${
                isRecording ? 'bg-[#1a0a20] border-app-accent' : 'bg-app-card border-[#2a2a5a]'
              }`}
              onPress={handleMicPress}
            >
              <Text className="text-xl">{isRecording ? '⏹' : '🎙'}</Text>
              <Text className="text-base font-bold text-app-text">
                {isRecording ? 'Stop Mic' : 'Start Mic'}
              </Text>
            </Pressable>
          </>
        )}
      </View>

      <ModelDownloadSheet
        visible={showDownloadSheet}
        modelSize={settings.whisperModelSize}
        onDismiss={() => setShowDownloadSheet(false)}
        onDownloadComplete={() => setShowDownloadSheet(false)}
      />
    </>
  );
}
