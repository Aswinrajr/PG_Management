import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, ErrorText, Field, Page, T } from '@/lib/ui';

const RESEND_SEC = 30;

interface VerifyResult {
  accessToken: string;
  refreshToken: string;
}

export default function Login() {
  const { status, signIn } = useAuth();
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

  if (status === 'in') return <Redirect href="/" />;

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
    <Page>
      <View style={{ paddingTop: 48, gap: 16 }}>
        <Image source={require('../assets/icon.png')} style={{ width: 72, height: 72, alignSelf: 'center', borderRadius: 16 }} accessibilityLabel="Roomora" />
        <T size={24} weight="700" center>{step === 'phone' ? 'Log in to Roomora' : 'Enter OTP'}</T>
        <T muted center>{step === 'phone' ? 'We will send a 6-digit code to your phone.' : `Sent to +91 ${phone}`}</T>
        <Card>
          <View style={{ gap: 12 }}>
            {step === 'phone' ? (
              <>
                <Field label="Mobile number" keyboardType="number-pad" maxLength={10} autoComplete="tel" value={phone} onChangeText={(v) => setPhone(v.replace(/\D/g, ''))} />
                <ErrorText error={error} />
                <Button title="Get OTP" loading={busy} disabled={phone.length !== 10} onPress={() => void send()} />
              </>
            ) : (
              <>
                <Field
                  label="6-digit code"
                  keyboardType="number-pad"
                  maxLength={6}
                  autoComplete="one-time-code"
                  autoFocus
                  value={code}
                  onChangeText={(v) => {
                    const value = v.replace(/\D/g, '');
                    setCode(value);
                    if (value.length === 6) void verify(value);
                  }}
                />
                <ErrorText error={error} />
                <Button title="Verify" loading={busy} disabled={code.length !== 6} onPress={() => void verify(code)} />
                <Button title={wait > 0 ? `Resend in ${wait}s` : 'Resend OTP'} variant="secondary" disabled={wait > 0} onPress={() => void send()} />
                <Button title="Change number" variant="secondary" onPress={() => { setStep('phone'); setCode(''); setError(null); }} />
              </>
            )}
          </View>
        </Card>
        <T size={12} muted center>New PG owner? Register on the Roomora website.</T>
      </View>
    </Page>
  );
}
