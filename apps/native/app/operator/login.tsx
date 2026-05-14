import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';

export default function OperatorLoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!username || !password) return;
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      router.replace('/operator');
    } catch {
      setError('Invalid username or password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-[#130f12]"
      style={{ paddingTop: insets.top }}
    >
      <View className="flex-1 justify-center px-6">
        <Text className="text-2xl font-bold text-white text-center mb-8">Theatrico</Text>
        <View className="bg-[#1e1a1d] rounded-2xl p-6 gap-4">
          <Text className="text-lg font-semibold text-white">Operator Login</Text>
          {error ? (
            <View className="bg-red-900/30 rounded-lg px-3 py-2">
              <Text className="text-red-400 text-sm">{error}</Text>
            </View>
          ) : null}
          <View className="gap-1.5">
            <Text className="text-white/60 text-sm">Username</Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              className="bg-[#130f12] border border-white/10 rounded-xl px-4 py-3 text-white"
              placeholderTextColor="rgba(255,255,255,0.3)"
            />
          </View>
          <View className="gap-1.5">
            <Text className="text-white/60 text-sm">Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              className="bg-[#130f12] border border-white/10 rounded-xl px-4 py-3 text-white"
              placeholderTextColor="rgba(255,255,255,0.3)"
            />
          </View>
          <Pressable
            onPress={handleLogin}
            disabled={loading || !username || !password}
            className="mt-2 bg-[#b31e35] rounded-xl py-3 items-center"
          >
            {loading ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text className="text-white font-semibold text-base">Sign in</Text>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
