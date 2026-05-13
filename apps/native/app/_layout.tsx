import '../global.css';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { SpeechRecognizerProvider } from '@/context/SpeechRecognizerContext';
import { SettingsProvider } from '@/context/SettingsContext';

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <SettingsProvider>
          <SpeechRecognizerProvider>
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: '#1a1a2e' },
                headerTintColor: '#ffffff',
                headerTitleStyle: { fontWeight: 'bold' },
              }}
            />
          </SpeechRecognizerProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
