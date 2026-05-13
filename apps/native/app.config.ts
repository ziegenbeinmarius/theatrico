import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Theatrico',
  slug: 'theatrico-native',
  version: '1.0.0',
  orientation: 'default',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  newArchEnabled: true,
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#1a1a2e',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.theatrico.native',
    infoPlist: {
      NSMicrophoneUsageDescription:
        'Theatrico uses the microphone to transcribe live speech for the script prompter.',
      NSSpeechRecognitionUsageDescription:
        'Theatrico uses speech recognition to follow along with dialogue and advance the script automatically.',
      NSCameraUsageDescription:
        'Theatrico uses the camera to scan session QR codes so audiences can join quickly.',
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#1a1a2e',
    },
    package: 'com.theatrico.app',
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-splash-screen',
    'expo-asset',
    [
      'expo-build-properties',
      {
        android: {
          ndkVersion: '24.0.8215888',
          extraProguardRules: '-keep class com.rnwhisper.** { *; }',
        },
      },
    ],
    [
      'expo-audio',
      {
        microphonePermission: 'Allow Theatrico to access your microphone for live transcription.',
      },
    ],
    [
      'expo-camera',
      { cameraPermission: 'Allow Theatrico to access your camera to scan session QR codes.' },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  scheme: 'theatrico',
  extra: {
    BACKEND_URL: process.env.BACKEND_URL ?? '',
    eas: {
      projectId: '5618cd1a-3250-4354-a69a-47438eb26b54',
    },
  },
});
