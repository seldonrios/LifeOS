import { useQuery } from '@tanstack/react-query';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';
import { darkColors, lightColors } from '@lifeos/ui';

import { sdk } from '../../lib/sdk';

export default function TabsLayout() {
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? darkColors : lightColors;
  const { data } = useQuery({
    queryKey: ['inbox'],
    queryFn: () => sdk.inbox.list(),
  });

  const unreadApprovalCount = (data ?? []).filter(
    (item) => item.type === 'approval' && !item.read,
  ).length;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.accent.brand,
        tabBarInactiveTintColor: palette.text.muted,
        tabBarStyle: {
          backgroundColor: palette.background.primary,
          borderTopColor: palette.border.default,
          borderTopWidth: 1,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, size }) => <Ionicons name="today" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="capture"
        options={{
          title: 'Capture',
          tabBarIcon: ({ color, size }) => <Ionicons name="add-circle" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          ...(unreadApprovalCount > 0 ? { tabBarBadge: unreadApprovalCount } : {}),
          tabBarIcon: ({ color, size }) => <Ionicons name="mail" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="review"
        options={{
          title: 'Review',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkmark-circle" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="ellipsis-horizontal" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
