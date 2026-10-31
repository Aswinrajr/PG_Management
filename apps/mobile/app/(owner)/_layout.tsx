import { Redirect, Tabs } from 'expo-router';
import { BedDouble, Home, Menu, Users, Wallet } from 'lucide-react-native';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/ui';

export default function OwnerTabs() {
  const { status } = useAuth();
  const c = useTheme();
  if (status !== 'in') return <Redirect href="/" />;
  const icon = (Icon: typeof Home) => ({ color, size }: { color: unknown; size: number }) => <Icon color={String(color)} size={size} />;
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: c.primary, tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border } }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon(Home) }} />
      <Tabs.Screen name="beds" options={{ title: 'Beds', tabBarIcon: icon(BedDouble) }} />
      <Tabs.Screen name="residents" options={{ title: 'Residents', tabBarIcon: icon(Users) }} />
      <Tabs.Screen name="money" options={{ title: 'Money', tabBarIcon: icon(Wallet) }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon(Menu) }} />
    </Tabs>
  );
}
