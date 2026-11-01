import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from './auth';
import { appRoute } from './links';
import { getSocket } from './socket';
import { T, useTheme } from './ui';

interface Live {
  title: string;
  body: string;
  link?: string;
}

const SHOW_MS = 6000;

/** Live alerts slide down from the top, for all three roles. */
export function LiveToast() {
  const { status } = useAuth();
  const c = useTheme();
  const client = useQueryClient();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<Live | null>(null);
  const y = useRef(new Animated.Value(-160)).current;

  useEffect(() => {
    if (status !== 'in') return;
    const socket = getSocket();
    const onNotification = (n: Live) => {
      setToast(n);
      void client.invalidateQueries();
    };
    socket.on('notification', onNotification);
    return () => void socket.off('notification', onNotification);
  }, [status, client]);

  useEffect(() => {
    if (!toast) return;
    Animated.spring(y, { toValue: 0, friction: 8, useNativeDriver: Platform.OS !== 'web' }).start();
    const timer = setTimeout(() => {
      Animated.timing(y, { toValue: -160, duration: 220, useNativeDriver: Platform.OS !== 'web' }).start(() => setToast(null));
    }, SHOW_MS);
    return () => clearTimeout(timer);
  }, [toast, y]);

  if (!toast) return null;
  const route = appRoute(toast.link);
  return (
    <Animated.View style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12, zIndex: 50, transform: [{ translateY: y }] }}>
      <Pressable
        accessibilityRole="alert"
        onPress={() => {
          setToast(null);
          if (route) router.push(route as never);
        }}
        style={{ flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: c.surface, borderRadius: 16, padding: 14, shadowColor: '#0F172A', shadowOpacity: 0.2, shadowRadius: 16, elevation: 8 }}
      >
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Bell size={18} color={c.primary} /></View>
        <View style={{ flex: 1 }}>
          <T weight="700">{toast.title}</T>
          <T size={12} muted>{toast.body}</T>
        </View>
        {route && <T size={12} weight="700" color={c.primary}>View</T>}
      </Pressable>
    </Animated.View>
  );
}
