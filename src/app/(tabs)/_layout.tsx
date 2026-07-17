import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { colors, fontFamilies } from '@/theme/tokens';

const icons = {
  index: ['book-outline', 'book'] as const,
  notes: ['bookmark-outline', 'bookmark'] as const,
  translations: ['library-outline', 'library'] as const,
  settings: ['options-outline', 'options'] as const,
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneStyle: { backgroundColor: colors.paper },
        tabBarActiveTintColor: colors.emerald,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarStyle: {
          backgroundColor: colors.paperLight,
          borderTopColor: colors.border,
          height: 72,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontFamily: fontFamilies.bodyBold, fontSize: 13 },
        tabBarIcon: ({ color, focused, size }) => {
          const pair = icons[route.name as keyof typeof icons] ?? icons.index;
          return <Ionicons color={color} name={focused ? pair[1] : pair[0]} size={size} />;
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Quran' }} />
      <Tabs.Screen name="notes" options={{ title: 'Notes' }} />
      <Tabs.Screen name="translations" options={{ title: 'Library' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
