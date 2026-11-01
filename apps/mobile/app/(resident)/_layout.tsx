import { Tabs } from 'expo-router';
import { CreditCard, Home, Trophy, User, WashingMachine, Wrench } from 'lucide-react-native';
import { tabIcon, useTabOptions } from '@/lib/tabs';

export default function ResidentTabs() {
  const options = useTabOptions();
  return (
    <Tabs screenOptions={options}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon(Home) }} />
      <Tabs.Screen name="payments" options={{ title: 'Payments', tabBarIcon: tabIcon(CreditCard) }} />
      <Tabs.Screen name="requests" options={{ title: 'Requests', tabBarIcon: tabIcon(Wrench) }} />
      <Tabs.Screen name="games" options={{ title: 'Games', tabBarIcon: tabIcon(Trophy) }} />
      <Tabs.Screen name="laundry" options={{ title: 'Laundry', tabBarIcon: tabIcon(WashingMachine) }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tabIcon(User) }} />
    </Tabs>
  );
}
