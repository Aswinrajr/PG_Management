import { formatINR } from '@roomora/types';
import tokens from '@roomora/ui-tokens/tokens.json';
import type { UseQueryResult } from '@tanstack/react-query';
import { useMemo, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, useColorScheme, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function useTheme() {
  return useColorScheme() === 'dark' ? tokens.color.dark : tokens.color.light;
}

const useStyles = () => {
  const c = useTheme();
  return useMemo(
    () =>
      StyleSheet.create({
        card: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 16 },
        input: { minHeight: 48, borderColor: c.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, color: c.text, backgroundColor: c.surface, fontSize: 16 },
      }),
    [c],
  );
};

export function T({ children, muted, size = 14, weight, color, center }: { children: ReactNode; muted?: boolean; size?: number; weight?: '400' | '500' | '600' | '700'; color?: string; center?: boolean }) {
  const c = useTheme();
  return <Text style={{ color: color ?? (muted ? c.textMuted : c.text), fontSize: size, fontWeight: weight, textAlign: center ? 'center' : undefined, lineHeight: size * 1.4 }}>{children}</Text>;
}

/** Scrolling page with pull to refresh. */
export function Page({ title, subtitle, children, onRefresh, refreshing = false, right }: { title?: string; subtitle?: string; children: ReactNode; onRefresh?: () => void; refreshing?: boolean; right?: ReactNode }) {
  const c = useTheme();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12 }} refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}>
        {title && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flexShrink: 1 }}>
              <T size={24} weight="700">{title}</T>
              {subtitle && <T muted>{subtitle}</T>}
            </View>
            {right}
          </View>
        )}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  const s = useStyles();
  const c = useTheme();
  if (!onPress) return <View style={s.card}>{children}</View>;
  return <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.card, pressed && { borderColor: c.primary }]}>{children}</Pressable>;
}

export function Button({ title, onPress, variant = 'primary', loading, disabled, icon }: { title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger'; loading?: boolean; disabled?: boolean; icon?: ReactNode }) {
  const c = useTheme();
  const off = disabled || loading;
  const background = variant === 'primary' ? c.primary : variant === 'danger' ? c.dangerText : 'transparent';
  const foreground = variant === 'secondary' ? c.text : '#FFFFFF';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: 48, flexGrow: 1, borderRadius: 8, paddingHorizontal: 16, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: background, borderWidth: variant === 'secondary' ? 1 : 0, borderColor: c.border, opacity: off ? 0.5 : pressed ? 0.8 : 1 })}
    >
      {loading ? <ActivityIndicator color={foreground} /> : icon}
      <T color={foreground} weight="600">{title}</T>
    </Pressable>
  );
}

export function Field({ label, hint, ...input }: { label: string; hint?: string } & TextInputProps) {
  const s = useStyles();
  const c = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <T size={12} weight="500" muted>{label}</T>
      <TextInput accessibilityLabel={label} placeholderTextColor={c.textMuted} style={s.input} {...input} />
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
};

export function Badge({ status }: { status: string }) {
  const c = useTheme() as Record<string, string>;
  const [tone, label] = STATUS[status] ?? ['neutralText', status];
  return <View style={{ backgroundColor: c.surfaceMuted, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}><T size={12} weight="600" color={c[tone]}>{label}</T></View>;
}

export const Empty = ({ title, text }: { title: string; text?: string }) => (
  <View style={{ padding: 32, gap: 4 }}>
    <T size={16} weight="600" center>{title}</T>
    {text && <T muted center>{text}</T>}
  </View>
);

export const Row = ({ children }: { children: ReactNode }) => <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>{children}</View>;

export function Query<T>({ query, children }: { query: UseQueryResult<T, Error>; children: (data: T) => ReactNode }) {
  if (query.isPending) return <ActivityIndicator style={{ padding: 32 }} />;
  if (query.isError) {
    return (
      <View style={{ padding: 24, gap: 12 }}>
        <ErrorText error={query.error} />
        <Button title="Retry" variant="secondary" onPress={() => void query.refetch()} />
      </View>
    );
  }
  return <>{children(query.data)}</>;
}
