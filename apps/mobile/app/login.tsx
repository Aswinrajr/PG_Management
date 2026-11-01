import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { BRAND, Button, Card, ErrorText, Field, FadeIn, T, useTheme } from '@/lib/ui';

const RESEND_SEC = 30;
const CODE_LENGTH = 6;

interface VerifyResult {
  accessToken: string;
  refreshToken: string;
}

/** Six boxes over one hidden input, so paste and SMS autofill still work. */
function OtpBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const c = useTheme();
  const input = useRef<any>(null);
  return (
    <Pressable onPress={() => input.current?.focus()}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}>
        {Array.from({ length: CODE_LENGTH }, (_, i) => {
          const active = i === value.length;
          return (
            <View key={i} style={{ flex: 1, aspectRatio: 0.85, borderRadius: 12, borderWidth: active ? 2 : 1, borderColor: active ? c.primary : c.border, backgroundColor: value[i] ? c.primarySoft : c.surface, alignItems: 'center', justifyContent: 'center' }}>
              <T size={22} weight="700">{value[i] ?? ''}</T>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={input}
        accessibilityLabel="6-digit code"
        autoFocus
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={CODE_LENGTH}
        value={value}
        onChangeText={(v) => onChange(v.replace(/\D/g, ''))}
        style={{ position: 'absolute', inset: 0, opacity: 0.01, color: 'transparent' }}
      />
    </Pressable>
  );
}

export default function Login() {
  const { signIn } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = useTheme();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err as Error);
    } finally {
      setBusy(false);
    }
  };

  const send = () =>
    run(async () => {
      await api.post('/auth/otp/send', { phone });
      setStep('otp');
      setWait(RESEND_SEC);
    });

  const verify = (value: string) =>
    run(async () => {
      const result = await api.post<VerifyResult>('/auth/otp/verify', { phone, code: value });
      await signIn(result.accessToken, result.refreshToken);
    });

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
        <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingTop: insets.top + 40, paddingBottom: 72, alignItems: 'center', gap: 10, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}>
          <FadeIn style={{ alignItems: 'center', gap: 10 }}>
            <Image source={require('../assets/icon.png')} style={{ width: 84, height: 84, borderRadius: 22 }} accessibilityLabel="Roomora" />
            <T size={28} weight="800" color="#FFFFFF">roomora</T>
            <T color="rgba(255,255,255,0.85)">Smart PG and co-living</T>
          </FadeIn>
        </LinearGradient>
        <View style={{ padding: 16, marginTop: -48, gap: 12 }}>
          <Card>
            <View style={{ gap: 14 }}>
              <View>
                <T size={22} weight="800">{step === 'phone' ? 'Log in to Roomora' : 'Enter OTP'}</T>
                <T muted>{step === 'phone' ? 'We will send a 6-digit code to your phone.' : `Sent to +91 ${phone}`}</T>
              </View>
              {step === 'phone' ? (
                <>
                  <Field label="Mobile number" placeholder="98765 43210" keyboardType="number-pad" maxLength={10} autoComplete="tel" value={phone} onChangeText={(v) => setPhone(v.replace(/\D/g, ''))} />
                  <ErrorText error={error} />
                  <Button title="Get OTP" loading={busy} disabled={phone.length !== 10} onPress={() => void send()} />
                </>
              ) : (
                <>
                  <OtpBoxes
                    value={code}
                    onChange={(value) => {
                      setCode(value);
                      if (value.length === CODE_LENGTH) void verify(value);
                    }}
                  />
                  <ErrorText error={error} />
                  <Button title="Verify" loading={busy} disabled={code.length !== CODE_LENGTH} onPress={() => void verify(code)} />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button title={wait > 0 ? `Resend in ${wait}s` : 'Resend'} variant="secondary" disabled={wait > 0} onPress={() => void send()} />
                    <Button title="Change number" variant="secondary" onPress={() => { setStep('phone'); setCode(''); setError(null); }} />
                  </View>
                </>
              )}
            </View>
          </Card>
          <T size={12} muted center>New PG owner? Register on the Roomora website.</T>
          <Pressable accessibilityRole="button" onPress={() => router.push('/admin-login')} style={{ minHeight: 44, justifyContent: 'center' }}>
            <T size={12} weight="600" color={c.primary} center>Super Admin login</T>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
