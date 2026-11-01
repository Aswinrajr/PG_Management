import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';
import { LiveToast } from '@/lib/toast';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });

/** Screens exist only for the right session state, so logout and lock cannot leave one behind. */
function Routes() {
  const { status, me, workspace, offerBiometric } = useAuth();
  const inApp = status === 'in' && !offerBiometric;
  const area = !inApp ? null : me?.isSuperAdmin ? 'admin' : workspace?.role === 'resident' ? 'resident' : workspace?.role === 'owner' && workspace.orgStatus !== 'pending' ? 'owner' : null;
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade_from_bottom' }}>
      <Stack.Protected guard={status !== 'out' && !area}>
        <Stack.Screen name="index" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'out'}>
        <Stack.Screen name="login" />
        <Stack.Screen name="admin-login" />
      </Stack.Protected>
      <Stack.Protected guard={area === 'owner'}>
        <Stack.Screen name="(owner)" />
      </Stack.Protected>
      <Stack.Protected guard={area === 'resident'}>
        <Stack.Screen name="(resident)" />
        <Stack.Screen name="game/[id]" />
      </Stack.Protected>
      <Stack.Protected guard={area === 'admin'}>
        <Stack.Screen name="(admin)" />
        <Stack.Screen name="admin-org/[id]" />
      </Stack.Protected>
      <Stack.Protected guard={area !== null}>
        <Stack.Screen name="notifications" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="light" />
          <Routes />
          <LiveToast />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
