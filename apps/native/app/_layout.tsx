import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { SpeechRecognizerProvider } from '@/context/SpeechRecognizerContext';
import { SettingsProvider } from '@/context/SettingsContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { config } from '@/lib/config';
import { theatricoClient } from '@/services/api/theatricoClient';

function TokenSyncer() {
  const { token, logout } = useAuth();

  useEffect(() => {
    theatricoClient.setUnauthorizedHandler(async () => {
      await logout();
    });
    return () => {
      theatricoClient.setUnauthorizedHandler(null);
    };
  }, [logout]);

  theatricoClient.setToken(token);
  return null;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <SettingsProvider>
          <AuthProvider backendUrl={config.backendUrl}>
            <TokenSyncer />
            <SpeechRecognizerProvider>
              <Stack
                screenOptions={{
                  headerStyle: { backgroundColor: '#130f12' },
                  headerTintColor: '#ffffff',
                  headerTitleStyle: { fontWeight: 'bold' },
                }}
              />
            </SpeechRecognizerProvider>
          </AuthProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
