import { Redirect } from 'expo-router';
import { Fingerprint } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { Button, Card, ErrorText, Page, T, useTheme } from '@/lib/ui';

function Lock() {
  const { unlock, signOut } = useAuth();
  const c = useTheme();
  const [error, setError] = useState<Error | null>(null);
  return (
    <Page>
      <View style={{ paddingTop: 96, gap: 16, alignItems: 'center' }}>
        <Fingerprint size={64} color={c.primary} />
        <T size={22} weight="700">Unlock Roomora</T>
        <T muted center>Use your fingerprint or face to continue.</T>
        <ErrorText error={error} />
        <View style={{ alignSelf: 'stretch', gap: 8 }}>
          <Button title="Unlock" onPress={() => void unlock().then((ok) => setError(ok ? null : new Error('Not recognised. Try again.'))).catch((err) => setError(err))} />
          <Button title="Log in with OTP" variant="secondary" onPress={() => void signOut()} />
        </View>
      </View>
    </Page>
  );
}

function WebOnly({ title, text }: { title: string; text: string }) {
  const { signOut } = useAuth();
  return (
    <Page title={title}>
      <Card><T>{text}</T></Card>
      <Button title="Log out" variant="secondary" onPress={() => void signOut()} />
    </Page>
  );
}

export default function Gate() {
  const { status, me, workspace } = useAuth();
  if (status === 'loading') return <ActivityIndicator style={{ flex: 1 }} />;
  if (status === 'out') return <Redirect href="/login" />;
  if (status === 'locked') return <Lock />;
  if (me?.isSuperAdmin) return <WebOnly title="Super Admin" text="The admin console is on the Roomora website." />;
  if (!workspace) return <WebOnly title="No PG yet" text="Register your PG on the Roomora website, or ask your PG to add this number." />;
  if (workspace.role === 'owner' && workspace.orgStatus === 'pending') return <WebOnly title="Waiting for approval" text={`${workspace.orgName} is not approved yet. Finish or check your registration on the Roomora website.`} />;
  return <Redirect href={workspace.role === 'owner' ? '/(owner)' : '/(resident)'} />;
}
