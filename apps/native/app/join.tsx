import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';

type Tab = 'code' | 'qr';

function extractSessionCode(data: string): string {
  const match = /\/session\/([A-Z0-9]+)/i.exec(data);
  if (match?.[1]) return match[1].toUpperCase();
  return data.trim().toUpperCase();
}

export default function JoinScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('code');
  const [code, setCode] = useState('');
  const [scanned, setScanned] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const handleJoin = (sessionCode: string) => {
    const trimmed = sessionCode.trim().toUpperCase();
    if (trimmed) {
      router.push(`/session/${trimmed}`);
    }
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    handleJoin(extractSessionCode(data));
  };

  const handleTabChange = async (newTab: Tab) => {
    setTab(newTab);
    setScanned(false);
    if (newTab === 'qr' && !cameraPermission?.granted) {
      await requestCameraPermission();
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Join Session', headerShown: true }} />
      <View className="flex-1 bg-app-dark" style={{ paddingBottom: insets.bottom }}>
        <View className="flex-row mx-5 mt-5 bg-app-card rounded-xl overflow-hidden">
          {(['code', 'qr'] as Tab[]).map((t) => (
            <Pressable
              key={t}
              className={`flex-1 py-3 items-center ${tab === t ? 'bg-app-accent' : ''}`}
              onPress={() => void handleTabChange(t)}
            >
              <Text className={`text-sm font-bold ${tab === t ? 'text-white' : 'text-app-muted'}`}>
                {t === 'code' ? 'Enter Code' : 'Scan QR'}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === 'code' ? (
          <View className="flex-1 px-5 mt-8 gap-4">
            <Text className="text-[13px] font-bold text-app-label uppercase tracking-[1px]">
              Session Code
            </Text>
            <TextInput
              className="bg-app-input rounded-xl px-4 py-[14px] text-xl text-white tracking-[4px] text-center"
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              placeholder="e.g. ABC123"
              placeholderTextColor="#555577"
              autoCapitalize="characters"
              keyboardType="default"
              returnKeyType="join"
              onSubmitEditing={() => handleJoin(code)}
              autoFocus
            />
            <Pressable
              className={`bg-app-accent rounded-xl py-[14px] items-center ${!code.trim() ? 'opacity-40' : ''}`}
              onPress={() => handleJoin(code)}
              disabled={!code.trim()}
            >
              <Text className="text-white text-[15px] font-bold">Join as Audience</Text>
            </Pressable>
          </View>
        ) : (
          <View className="flex-1 mt-5 mx-5 rounded-2xl overflow-hidden">
            {!cameraPermission?.granted ? (
              <View className="flex-1 items-center justify-center gap-4 bg-app-card rounded-2xl px-6">
                <Text className="text-app-muted text-center text-sm">
                  Camera access is needed to scan the session QR code.
                </Text>
                <Pressable
                  className="bg-app-accent rounded-xl px-6 py-3"
                  onPress={() => void requestCameraPermission()}
                >
                  <Text className="text-white font-bold">Grant Permission</Text>
                </Pressable>
              </View>
            ) : (
              <CameraView
                className="flex-1"
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
              />
            )}
          </View>
        )}
      </View>
    </>
  );
}
