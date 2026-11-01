import { formatINR } from '@roomora/types';
import tokens from '@roomora/ui-tokens/tokens.json';
import type { UseQueryResult } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Image, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, useColorScheme, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGet } from './api';

/** The header gradient stays brand indigo in both themes, so white text always reads. */
export const BRAND = ['#6366F1', '#4F46E5', '#3730A3'] as const;
const native = Platform.OS !== 'web';

export function useTheme() {
  return useColorScheme() === 'dark' ? tokens.color.dark : tokens.color.light;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => subscription.remove();
  }, []);
  return reduced;
}

export function T({ children, muted, size = 14, weight, color, center }: { children: ReactNode; muted?: boolean; size?: number; weight?: '400' | '500' | '600' | '700' | '800'; color?: string; center?: boolean }) {
  const c = useTheme();
  return <Text style={{ color: color ?? (muted ? c.textMuted : c.text), fontSize: size, fontWeight: weight, textAlign: center ? 'center' : undefined, lineHeight: size * 1.4 }}>{children}</Text>;
}

/** Content rises gently into place. */
export function FadeIn({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: object }) {
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(value, { toValue: 1, duration: reduced ? 0 : 320, delay: reduced ? 0 : delay, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start();
  }, [value, delay, reduced]);
  const translateY = value.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
  return <Animated.View style={[style, { opacity: value, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

/** Presses dip slightly, so every tap feels answered. */
function usePressScale() {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (toValue: number) => Animated.spring(scale, { toValue, speed: 40, bounciness: 6, useNativeDriver: native }).start();
  return { scale, onPressIn: () => to(0.97), onPressOut: () => to(1) };
}

export function BellButton() {
  const router = useRouter();
  const query = useGet<{ unread: number }>('/auth/notifications', { refetchInterval: 60_000, retry: false });
  const unread = query.data?.unread ?? 0;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Notifications, ${unread} unread`} onPress={() => router.push('/notifications')} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
      <Bell size={20} color="#FFFFFF" />
      {unread > 0 && (
        <View style={{ position: 'absolute', top: 6, right: 6, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>{unread}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Scrolling page with a brand header and pull to refresh. */
export function Page({ title, subtitle, children, onRefresh, refreshing = false, right, bell = true }: { title?: string; subtitle?: string; children: ReactNode; onRefresh?: () => void; refreshing?: boolean; right?: ReactNode; bell?: boolean }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} keyboardShouldPersistTaps="handled" refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} progressViewOffset={insets.top} /> : undefined}>
      {title ? (
        <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 44, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
          <FadeIn>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flexShrink: 1 }}>
                <T size={26} weight="800" color="#FFFFFF">{title}</T>
                {subtitle && <T color="rgba(255,255,255,0.8)">{subtitle}</T>}
              </View>
              {right ?? (bell && <BellButton />)}
            </View>
          </FadeIn>
        </LinearGradient>
      ) : <View style={{ height: insets.top }} />}
      <View style={{ padding: 16, gap: 12, marginTop: title ? -32 : 0 }}>{children}</View>
    </ScrollView>
  );
}

export function Card({ children, onPress, accent }: { children: ReactNode; onPress?: () => void; accent?: string }) {
  const c = useTheme();
  const press = usePressScale();
  const style = useMemo(
    () => ({ backgroundColor: c.surface, borderRadius: 16, padding: 16, gap: 4, borderLeftWidth: accent ? 4 : 0, borderLeftColor: accent, shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 }),
    [c, accent],
  );
  if (!onPress) return <FadeIn><View style={style}>{children}</View></FadeIn>;
  return (
    <FadeIn>
      <Pressable accessibilityRole="button" onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut}>
        <Animated.View style={[style, { transform: [{ scale: press.scale }] }]}>{children}</Animated.View>
      </Pressable>
    </FadeIn>
  );
}

export function Button({ title, onPress, variant = 'primary', loading, disabled, icon }: { title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger'; loading?: boolean; disabled?: boolean; icon?: ReactNode }) {
  const c = useTheme();
  const press = usePressScale();
  const off = disabled || loading;
  const foreground = variant === 'secondary' ? c.text : '#FFFFFF';
  const inner = (
    <>
      {loading ? <ActivityIndicator color={foreground} /> : icon}
      <T color={foreground} weight="700">{title}</T>
    </>
  );
  const box = { minHeight: 50, borderRadius: 14, paddingHorizontal: 16, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' } as const;
  return (
    <Pressable style={{ flexGrow: 1 }} accessibilityRole="button" accessibilityLabel={title} disabled={off} onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut}>
      <Animated.View style={{ opacity: off ? 0.5 : 1, transform: [{ scale: press.scale }] }}>
        {variant === 'primary' ? (
          <LinearGradient colors={['#6366F1', '#4F46E5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={box}>{inner}</LinearGradient>
        ) : <View style={[box, variant === 'danger' ? { backgroundColor: c.dangerText } : { borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }]}>{inner}</View>}
      </Animated.View>
    </Pressable>
  );
}

export function Field({ label, hint, ...input }: { label: string; hint?: string } & TextInputProps) {
  const c = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 4 }}>
      <T size={12} weight="600" muted>{label}</T>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.textMuted}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{ minHeight: 50, borderWidth: focused ? 2 : 1, borderColor: focused ? c.primary : c.border, borderRadius: 12, paddingHorizontal: 14, color: c.text, backgroundColor: c.surface, fontSize: 16 }}
        {...input}
      />
      {hint && <T size={12} muted>{hint}</T>}
    </View>
  );
}

export const Money = ({ paise, size, weight }: { paise: number; size?: number; weight?: '600' | '700' }) => <T size={size} weight={weight}>{formatINR(paise)}</T>;

export function ErrorText({ error }: { error?: Error | null }) {
  const c = useTheme();
  return error ? <T color={c.dangerText}>{error.message}</T> : null;
}

const STATUS: Record<string, [string, string]> = {
  paid: ['successText', 'Paid'], due: ['warningText', 'Due'], partially_paid: ['warningText', 'Part paid'], overdue: ['dangerText', 'Overdue'], void: ['neutralText', 'Void'],
  open: ['dangerText', 'Open'], in_progress: ['warningText', 'In progress'], resolved: ['successText', 'Resolved'], closed: ['neutralText', 'Closed'], rejected: ['neutralText', 'Rejected'],
  booked: ['infoText', 'Booked'], active: ['successText', 'Active'], notice: ['warningText', 'On notice'], checked_out: ['neutralText', 'Checked out'],
  vacant: ['neutralText', 'Vacant'], reserved: ['infoText', 'Reserved'], occupied: ['successText', 'Occupied'], maintenance: ['dangerText', 'Maintenance'],
  pending: ['warningText', 'Waiting'], trial: ['infoText', 'Trial'], read_only: ['warningText', 'Read only'], suspended: ['dangerText', 'Suspended'],
  pending_review: ['warningText', 'To review'], approved: ['successText', 'Approved'], not_submitted: ['neutralText', 'Not submitted'],
};

export function Badge({ status }: { status: string }) {
  const c = useTheme() as Record<string, string>;
  const [tone, label] = STATUS[status] ?? ['neutralText', status];
  return <View style={{ backgroundColor: c.surfaceMuted, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}><T size={12} weight="600" color={c[tone]}>{label}</T></View>;
}

export const Empty = ({ title, text }: { title: string; text?: string }) => (
  <Card>
    <View style={{ padding: 16, gap: 4 }}>
      <T size={16} weight="700" center>{title}</T>
      {text && <T muted center>{text}</T>}
    </View>
  </Card>
);

export const Row = ({ children }: { children: ReactNode }) => <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>{children}</View>;

export function Stat({ label, value, icon, tint, delay }: { label: string; value: string; icon: ReactNode; tint: string; delay?: number }) {
  const c = useTheme();
  return (
    <FadeIn delay={delay} style={{ flexBasis: '47%', flexGrow: 1 }}>
      <View style={{ backgroundColor: c.surface, borderRadius: 16, padding: 14, gap: 8, shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 }}>
        <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: `${tint}22`, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
        <T size={12} muted>{label}</T>
        <T size={20} weight="800">{value}</T>
      </View>
    </FadeIn>
  );
}

function Skeleton({ height }: { height: number }) {
  const c = useTheme();
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: 650, useNativeDriver: native }),
        Animated.timing(value, { toValue: 0.45, duration: 650, useNativeDriver: native }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [value, reduced]);
  return <Animated.View style={{ height, borderRadius: 16, backgroundColor: c.surfaceMuted, opacity: value }} />;
}

export function Loading() {
  return (
    <View accessibilityLabel="Loading" style={{ gap: 12 }}>
      <Skeleton height={92} />
      <Skeleton height={72} />
      <Skeleton height={72} />
    </View>
  );
}

/** First screen of the app: the logo settles in while a ring pulses behind it. */
export function Splash() {
  const reduced = useReducedMotion();
  const enter = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(enter, { toValue: 1, friction: 5, tension: 60, useNativeDriver: native }).start();
    if (reduced) return;
    const loop = Animated.loop(Animated.timing(ring, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: native }));
    loop.start();
    return () => loop.stop();
  }, [enter, ring, reduced]);
  const scale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  return (
    <LinearGradient accessibilityLabel="Loading Roomora" colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={{ position: 'absolute', width: 112, height: 112, borderRadius: 32, borderWidth: 2, borderColor: '#FFFFFF', opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }] }} />
        <Animated.View style={{ opacity: enter, transform: [{ scale }] }}>
          <Image source={require('../../assets/icon.png')} style={{ width: 112, height: 112, borderRadius: 28 }} />
        </Animated.View>
      </View>
      <Animated.View style={{ opacity: enter, alignItems: 'center' }}>
        <T size={28} weight="800" color="#FFFFFF">roomora</T>
        <T color="rgba(255,255,255,0.8)">Smart PG and co-living</T>
      </Animated.View>
    </LinearGradient>
  );
}

export function Query<T>({ query, children }: { query: UseQueryResult<T, Error>; children: (data: T) => ReactNode }) {
  if (query.isPending) return <Loading />;
  if (query.isError) {
    return (
      <Card>
        <View style={{ gap: 12 }}>
          <ErrorText error={query.error} />
          <Button title="Retry" variant="secondary" onPress={() => void query.refetch()} />
        </View>
      </Card>
    );
  }
  return <>{children(query.data)}</>;
}

export const sharedStyles = StyleSheet.create({ fill: { flex: 1 } });
