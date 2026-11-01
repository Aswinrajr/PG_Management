import { LinearGradient } from 'expo-linear-gradient';
import { Fingerprint } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { BRAND, Button, Card, Page, Splash, T } from '@/lib/ui';

/** A fingerprint with slow ripples, used on the unlock and setup screens. */
function PulsingPrint() {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const ring = (from: number, to: number) => ({
    position: 'absolute' as const,
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [from, to] }) }],
  });
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', height: 200 }}>
      <Animated.View style={ring(1, 1.5)} />
      <Animated.View style={ring(0.9, 1.25)} />
      <View style={{ width: 128, height: 128, borderRadius: 64, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
        <Fingerprint size={68} color="#FFFFFF" />
      </View>
    </View>
  );
}

function Lock() {
  const { unlock, signOut, me } = useAuth();
  const insets = useSafeAreaInsets();
  const [failed, setFailed] = useState(false);
  const attempt = () => void unlock().then((ok) => setFailed(!ok)).catch(() => setFailed(true));

  useEffect(attempt, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <LinearGradient colors={BRAND} style={{ flex: 1, paddingTop: insets.top + 56, paddingBottom: insets.bottom + 24, paddingHorizontal: 24, justifyContent: 'space-between' }}>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <T size={26} weight="800" color="#FFFFFF" center>{me?.user.name ? `Welcome back, ${me.user.name.split(' ')[0]}` : 'Welcome back'}</T>
        <T color="rgba(255,255,255,0.85)" center>Touch the sensor to unlock Roomora</T>
        <PulsingPrint />
        {failed && <T color="#FFFFFF" weight="600" center>Not recognised. Try again.</T>}
      </View>
      <View style={{ gap: 10 }}>
        <Button title="Unlock with fingerprint" variant="secondary" onPress={attempt} />
        <Button title="Log in with OTP instead" variant="secondary" onPress={() => void signOut()} />
      </View>
    </LinearGradient>
  );
}

/** Asked once, right after the first login on this phone. */
function BiometricOffer() {
  const { setBiometric, dismissBiometricOffer } = useAuth();
  const insets = useSafeAreaInsets();
  const [failed, setFailed] = useState(false);
  return (
    <LinearGradient colors={BRAND} style={{ flex: 1, paddingTop: insets.top + 56, paddingBottom: insets.bottom + 24, paddingHorizontal: 24, justifyContent: 'space-between' }}>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <T size={26} weight="800" color="#FFFFFF" center>Log in faster</T>
        <PulsingPrint />
        <T color="rgba(255,255,255,0.9)" center>Use your fingerprint or face instead of an OTP. It stays on this phone and never reaches Roomora.</T>
        {failed && <T color="#FFFFFF" weight="600" center>That did not work. Try again.</T>}
      </View>
      <View style={{ gap: 10 }}>
        <Button title="Turn on fingerprint login" variant="secondary" onPress={() => void setBiometric(true).then((ok) => (ok ? dismissBiometricOffer() : setFailed(true)))} />
        <Button title="Not now" variant="secondary" onPress={() => void dismissBiometricOffer()} />
      </View>
    </LinearGradient>
  );
}

function WebOnly({ title, text }: { title: string; text: string }) {
  const { signOut } = useAuth();
  return (
    <Page title={title} bell={false}>
      <Card><T>{text}</T></Card>
      <Button title="Log out" variant="secondary" onPress={() => void signOut()} />
    </Page>
  );
}

/** Shown when no tabs apply: starting up, locked, the fingerprint offer, or nothing to open yet. */
export default function Gate() {
  const { status, workspace, offerBiometric } = useAuth();
  if (status === 'locked') return <Lock />;
  if (offerBiometric) return <BiometricOffer />;
  if (status === 'in' && !workspace) return <WebOnly title="No PG yet" text="Register your PG on the Roomora website, or ask your PG to add this number." />;
  if (status === 'in' && workspace?.orgStatus === 'pending') return <WebOnly title="Waiting for approval" text={`${workspace.orgName} is not approved yet. Finish or check your registration on the Roomora website.`} />;
  return <Splash />;
}
