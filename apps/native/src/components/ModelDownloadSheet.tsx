import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WHISPER_MODEL_URLS, type WhisperModelSize } from '@/context/SettingsContext';

type DownloadState = 'idle' | 'downloading' | 'done' | 'error';

interface ModelDownloadSheetProps {
  visible: boolean;
  modelSize: WhisperModelSize;
  onDismiss: () => void;
  onDownloadComplete: () => void;
}

function useModelDownload(
  modelSize: WhisperModelSize,
  active: boolean,
): {
  state: DownloadState;
  progress: number;
  errorMessage: string | null;
  start: () => void;
  cancel: () => void;
} {
  const [state, setState] = useState<DownloadState>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const taskRef = useRef<{ pauseAsync?: () => Promise<void> } | null>(null);

  useEffect(() => {
    if (!active) {
      cancelledRef.current = false;
      setState('idle');
      setProgress(0);
      setErrorMessage(null);
    }
  }, [active]);

  const start = () => {
    cancelledRef.current = false;
    setState('downloading');
    setProgress(0);
    setErrorMessage(null);

    const { url } = WHISPER_MODEL_URLS[modelSize];
    const fileName = url.split('/').pop() ?? 'whisper-model.bin';

    // Lazy require expo-file-system to stay compatible with web/jest
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FileSystem = require('expo-file-system/legacy') as {
      cacheDirectory: string;
      getInfoAsync: (p: string) => Promise<{ exists: boolean }>;
      createDownloadResumable: (
        url: string,
        dest: string,
        opts: object,
        cb: (p: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void,
      ) => { downloadAsync: () => Promise<unknown>; pauseAsync?: () => Promise<void> };
    };

    const dest = `${FileSystem.cacheDirectory}${fileName}`;

    const task = FileSystem.createDownloadResumable(url, dest, {}, (p) => {
      if (cancelledRef.current) return;
      if (p.totalBytesExpectedToWrite > 0) {
        setProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite);
      }
    });

    taskRef.current = task;

    FileSystem.getInfoAsync(dest)
      .then((info) => {
        if (info.exists) {
          setProgress(1);
          setState('done');
          return;
        }
        return task.downloadAsync();
      })
      .then(() => {
        if (cancelledRef.current) return;
        setProgress(1);
        setState('done');
      })
      .catch((err: unknown) => {
        if (cancelledRef.current) return;
        setState('error');
        setErrorMessage(err instanceof Error ? err.message : 'Download failed');
      });
  };

  const cancel = () => {
    cancelledRef.current = true;
    void taskRef.current?.pauseAsync?.();
    setState('idle');
    setProgress(0);
  };

  return { state, progress, errorMessage, start, cancel };
}

export function ModelDownloadSheet({
  visible,
  modelSize,
  onDismiss,
  onDownloadComplete,
}: ModelDownloadSheetProps) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(300)).current;
  const { state, progress, errorMessage, start, cancel } = useModelDownload(modelSize, visible);

  const modelInfo = WHISPER_MODEL_URLS[modelSize];

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 150,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  useEffect(() => {
    if (state === 'done') {
      const timer = setTimeout(onDownloadComplete, 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [state, onDownloadComplete]);

  const progressWidth = `${Math.round(progress * 100)}%`;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onDismiss}>
      {/* Scrim */}
      <Pressable
        className="flex-1 bg-black/60"
        onPress={() => {
          if (state !== 'downloading') onDismiss();
        }}
      />

      {/* Sheet */}
      <Animated.View
        style={[{ transform: [{ translateY: slideAnim }], paddingBottom: insets.bottom + 16 }]}
        className="absolute bottom-0 left-0 right-0 bg-app-card rounded-t-3xl px-5 pt-5"
      >
        {/* Handle */}
        <View className="self-center w-10 h-1 bg-app-subtle rounded-full mb-5" />

        <Text className="text-app-text text-lg font-bold mb-1">Download Whisper Model</Text>
        <Text className="text-app-muted text-[13px] mb-5">
          {`${modelSize.charAt(0).toUpperCase() + modelSize.slice(1)} model · ${modelInfo.sizeLabel} · ~${modelInfo.estimatedSeconds}s on Wi-Fi`}
        </Text>

        {/* Progress bar */}
        {state === 'downloading' || state === 'done' ? (
          <View className="mb-4">
            <View className="h-2 bg-app-input rounded-full overflow-hidden">
              <View
                className="h-full bg-app-accent rounded-full"
                style={{ width: progressWidth as `${number}%` }}
              />
            </View>
            <Text className="text-app-muted text-[12px] mt-1.5 text-right">
              {state === 'done' ? 'Complete' : `${Math.round(progress * 100)}%`}
            </Text>
          </View>
        ) : null}

        {state === 'error' && errorMessage ? (
          <Text className="text-app-accent text-[13px] mb-4">{errorMessage}</Text>
        ) : null}

        {/* Buttons */}
        {state === 'idle' || state === 'error' ? (
          <View className="flex-row gap-3">
            <Pressable
              className="flex-1 bg-app-input rounded-xl py-3.5 items-center"
              onPress={onDismiss}
            >
              <Text className="text-app-label font-semibold">Not Now</Text>
            </Pressable>
            <Pressable
              className="flex-[2] bg-app-accent rounded-xl py-3.5 items-center"
              onPress={start}
            >
              <Text className="text-white font-bold">
                {state === 'error' ? 'Retry Download' : 'Download'}
              </Text>
            </Pressable>
          </View>
        ) : state === 'downloading' ? (
          <Pressable
            className="bg-app-input rounded-xl py-3.5 items-center"
            onPress={() => {
              cancel();
              onDismiss();
            }}
          >
            <Text className="text-app-label font-semibold">Cancel</Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </Modal>
  );
}
