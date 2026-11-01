import { Tabs } from 'expo-router';
import { Building2, FileCheck2, Gauge, Menu } from 'lucide-react-native';
import { tabIcon, useTabOptions } from '@/lib/tabs';

export default function AdminTabs() {
  const options = useTabOptions();
  return (
    <Tabs screenOptions={options}>
      <Tabs.Screen name="index" options={{ title: 'Dashboard', tabBarIcon: tabIcon(Gauge) }} />
      <Tabs.Screen name="kyc" options={{ title: 'KYC queue', tabBarIcon: tabIcon(FileCheck2) }} />
      <Tabs.Screen name="owners" options={{ title: 'PG owners', tabBarIcon: tabIcon(Building2) }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: tabIcon(Menu) }} />
    </Tabs>
  );
}
