import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, ErrorText, Field, Page } from '@/lib/ui';

export default function AdminLogin() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '', totp: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { accessToken, refreshToken } = await api.post<{ accessToken: string; refreshToken: string }>('/auth/admin/login', form);
      await signIn(accessToken, refreshToken);
    } catch (err) {
      setError(err as Error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="Super Admin" subtitle="Platform team only" bell={false}>
      <Card>
        <View style={{ gap: 12 }}>
          <Field label="Email" autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={form.email} onChangeText={(email) => setForm({ ...form, email })} />
          <Field label="Password" secureTextEntry autoComplete="password" value={form.password} onChangeText={(password) => setForm({ ...form, password })} />
          <Field label="Authenticator code" keyboardType="number-pad" maxLength={6} value={form.totp} onChangeText={(totp) => setForm({ ...form, totp })} />
          <ErrorText error={error} />
          <Button title="Log in" loading={busy} disabled={!form.email || !form.password || form.totp.length !== 6} onPress={() => void submit()} />
          <Button title="Back" variant="secondary" onPress={() => router.back()} />
        </View>
      </Card>
    </Page>
  );
}
