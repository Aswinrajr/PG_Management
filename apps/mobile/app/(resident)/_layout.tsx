import { Redirect, Tabs } from 'expo-router';
import { CreditCard, Home, Trophy, User, WashingMachine, Wrench } from 'lucide-react-native';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/ui';

export default function ResidentTabs() {
  const { status } = useAuth();
  const c = useTheme();
  if (status !== 'in') return <Redirect href="/" />;
  const icon = (Icon: typeof Home) => ({ color, size }: { color: unknown; size: number }) => <Icon color={String(color)} size={size} />;
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: c.primary, tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border } }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon(Home) }} />
      <Tabs.Screen name="payments" options={{ title: 'Payments', tabBarIcon: icon(CreditCard) }} />
      <Tabs.Screen name="requests" options={{ title: 'Requests', tabBarIcon: icon(Wrench) }} />
      <Tabs.Screen name="games" options={{ title: 'Games', tabBarIcon: icon(Trophy) }} />
      <Tabs.Screen name="laundry" options={{ title: 'Laundry', tabBarIcon: icon(WashingMachine) }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon(User) }} />
    </Tabs>
  );
}
