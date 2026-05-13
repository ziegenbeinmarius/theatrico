import { ActivityIndicator, Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudienceSession, type WsStatus } from '@/hooks/useAudienceSession';
import { ScriptView } from '@/components/ScriptView';

function ConnectionBadge({ status }: { status: WsStatus }) {
  const configs: Record<WsStatus, { label: string; className: string }> = {
    connecting: { label: 'Connecting…', className: 'bg-app-subtle' },
    connected: { label: 'Live', className: 'bg-green-600' },
    reconnecting: { label: 'Reconnecting…', className: 'bg-yellow-600' },
    disconnected: { label: 'Disconnected', className: 'bg-app-accent' },
  };
  const cfg = configs[status];
  return (
    <View className={`px-3 py-1 rounded-full ${cfg.className}`}>
      <Text className="text-white text-[11px] font-bold uppercase tracking-[1px]">{cfg.label}</Text>
    </View>
  );
}

export default function AudienceScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const sessionCode = code ?? '';
  const { play, flatLines, isLoading, currentPosition, wsStatus, error } =
    useAudienceSession(sessionCode);

  return (
    <>
      <Stack.Screen options={{ title: sessionCode, headerShown: true }} />
      <View className="flex-1 bg-app-darker" style={{ paddingBottom: insets.bottom }}>
        <View
          className={`flex-row items-center justify-between px-4 border-b border-app-card ${
            isLandscape ? 'py-1.5' : 'py-2.5'
          }`}
        >
          <Text className="text-xs text-app-subtle tracking-[3px] uppercase">{sessionCode}</Text>
          <ConnectionBadge status={wsStatus} />
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center gap-3">
            <ActivityIndicator color="#e94560" size="large" />
            <Text className="text-sm text-app-muted">Loading script…</Text>
          </View>
        ) : error ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-app-accent text-center">{error.message}</Text>
          </View>
        ) : !play ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-sm text-app-muted text-center">Waiting for session data…</Text>
          </View>
        ) : !currentPosition ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-sm text-app-muted text-center">
              Waiting for the operator to start the session…
            </Text>
          </View>
        ) : (
          <ScriptView flatLines={flatLines} currentPosition={currentPosition} />
        )}
      </View>
    </>
  );
}
