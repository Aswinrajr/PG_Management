import type { LucideIcon } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Animated, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './ui';

function TabIcon({ Icon, color, focused }: { Icon: LucideIcon; color: string; focused: boolean }) {
  const c = useTheme();
  const value = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(value, { toValue: focused ? 1 : 0, speed: 20, bounciness: 10, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [focused, value]);
  const scale = value.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 48, height: 30 }}>
      <Animated.View style={{ position: 'absolute', width: 48, height: 30, borderRadius: 15, backgroundColor: c.primarySoft, opacity: value }} />
      <Animated.View style={{ transform: [{ scale }] }}><Icon color={color} size={21} /></Animated.View>
    </View>
  );
}

export const tabIcon = (Icon: LucideIcon) => ({ color, focused }: { color: unknown; focused: boolean }) => <TabIcon Icon={Icon} color={String(color)} focused={focused} />;

export function useTabOptions() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return {
    headerShown: false,
    tabBarActiveTintColor: c.primary,
    tabBarInactiveTintColor: c.textMuted,
    tabBarLabelStyle: { fontSize: 11, fontWeight: '600' as const },
    tabBarStyle: { backgroundColor: c.surface, borderTopWidth: 0, elevation: 12, shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 12, height: 62 + insets.bottom, paddingTop: 6, paddingBottom: insets.bottom + 4 },
  };
}
