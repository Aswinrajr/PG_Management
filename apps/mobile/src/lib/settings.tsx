import { useState } from 'react';
import { Switch, View } from 'react-native';
import { useAuth } from './auth';
import { Button, Card, ErrorText, Row, T } from './ui';

/** Shared by the owner and resident apps. */
export function AccountCard() {
  const { me, workspace, biometricOn, biometricReady, setBiometric, signOut } = useAuth();
  const [error, setError] = useState<Error | null>(null);
  return (
    <>
      <Card>
        <T weight="600">{me?.user.name || 'My account'}</T>
        <T muted>+{me?.user.phone}</T>
        <T muted>{workspace?.orgName}</T>
      </Card>
      <Card>
        <View style={{ gap: 4 }}>
          <Row>
            <T weight="600">Fingerprint or Face ID</T>
            <Switch
              accessibilityLabel="Unlock with fingerprint or Face ID"
              disabled={!biometricReady}
              value={biometricOn}
              onValueChange={(on) => void setBiometric(on).then((ok) => setError(ok ? null : new Error('That did not work. Try again.')))}
            />
          </Row>
          <T size={12} muted>{biometricReady ? 'Unlock Roomora without an OTP. Your fingerprint stays on this phone.' : 'Not available here. Set up a fingerprint in your phone settings.'}</T>
          <ErrorText error={error} />
        </View>
      </Card>
      <Button title="Log out" variant="secondary" onPress={() => void signOut()} />
    </>
  );
}
