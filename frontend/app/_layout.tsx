import { Stack } from 'expo-router';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { CONSTANTS } from '@/utils/constant';
import { StatusBar } from 'expo-status-bar';
import './globals.css';

export default function RootLayout() {
  return (
    <>
      <View
        style={{
          backgroundColor: CONSTANTS.colors.primary,
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 50,
        }}
      />
      <StatusBar style='light' />
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
          <Stack
            screenOptions={{
              headerShown: false,
            }}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    </>
  );
}
