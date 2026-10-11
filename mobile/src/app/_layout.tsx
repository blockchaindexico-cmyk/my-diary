import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AuthProvider, useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function RootNavigator() {
  const { status } = useAuth();
  const t = useTheme();

  useEffect(() => {
    if (status !== 'loading') SplashScreen.hideAsync();
  }, [status]);

  if (status === 'loading') return null;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: t.background },
        headerStyle: { backgroundColor: t.background },
        headerShadowVisible: false,
        headerTintColor: t.tint,
        headerTitleStyle: { color: t.text },
      }}>
      <Stack.Protected guard={status === 'signedIn'}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="entry/[id]" options={{ headerShown: true, title: '', headerBackTitle: 'Back' }} />
        <Stack.Screen name="ai-settings" options={{ headerShown: true, title: 'AI model', headerBackTitle: 'You' }} />
      </Stack.Protected>
      <Stack.Protected guard={status === 'signedOut'}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const t = useTheme();
  const base = t.scheme === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        value={{
          ...base,
          colors: { ...base.colors, primary: t.tint, background: t.background, card: t.card, text: t.text },
        }}>
        <AuthProvider onSignOut={() => queryClient.clear()}>
          <StatusBar style="auto" />
          <RootNavigator />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
