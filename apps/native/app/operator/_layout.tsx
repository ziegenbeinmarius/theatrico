import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { View, ActivityIndicator } from 'react-native';

export default function OperatorLayout() {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 bg-[#130f12] items-center justify-center">
        <ActivityIndicator color="white" size="large" />
      </View>
    );
  }

  if (!token) {
    return <Redirect href="/login" />;
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#130f12' },
          headerTintColor: '#ffffff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      />
    </>
  );
}
