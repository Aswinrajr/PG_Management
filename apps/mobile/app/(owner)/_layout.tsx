import { Tabs } from 'expo-router';
import { BedDouble, Home, Menu, Users, Wallet } from 'lucide-react-native';
import { tabIcon, useTabOptions } from '@/lib/tabs';

export default function OwnerTabs() {
  const options = useTabOptions();
  return (
    <Tabs screenOptions={options}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon(Home) }} />
      <Tabs.Screen name="beds" options={{ title: 'Beds', tabBarIcon: tabIcon(BedDouble) }} />
      <Tabs.Screen name="residents" options={{ title: 'Residents', tabBarIcon: tabIcon(Users) }} />
      <Tabs.Screen name="money" options={{ title: 'Money', tabBarIcon: tabIcon(Wallet) }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: tabIcon(Menu) }} />
    </Tabs>
  );
}
