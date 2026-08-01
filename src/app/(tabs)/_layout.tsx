import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fontFamilies } from '@/theme/tokens';

const icons = {
  index: ['book-outline', 'book'] as const,
  notes: ['bookmark-outline', 'bookmark'] as const,
  translations: ['library-outline', 'library'] as const,
  recitation: ['headset-outline', 'headset'] as const,
  settings: ['options-outline', 'options'] as const,
};

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

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
          height: 62 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 8),
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
      <Tabs.Screen name="recitation" options={{ title: 'Recitation' }} />
      <Tabs.Screen name="notes" options={{ title: 'Notes' }} />
      <Tabs.Screen name="translations" options={{ title: 'Library' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
