import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Amiri_400Regular } from '@expo-google-fonts/amiri/400Regular';
import { Amiri_700Bold } from '@expo-google-fonts/amiri/700Bold';
import { CormorantGaramond_500Medium } from '@expo-google-fonts/cormorant-garamond/500Medium';
import { CormorantGaramond_600SemiBold } from '@expo-google-fonts/cormorant-garamond/600SemiBold';
import { CormorantGaramond_600SemiBold_Italic } from '@expo-google-fonts/cormorant-garamond/600SemiBold_Italic';
import { CormorantGaramond_700Bold } from '@expo-google-fonts/cormorant-garamond/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { LoadingFolio } from '@/components/LoadingFolio';
import { UserDatabaseProvider } from '@/data/databases/UserDatabaseProvider';
import { initializeQuranDatabase } from '@/data/databases/quranDatabase';
import { SpeechProvider } from '@/features/speech/application/SpeechProvider';
import { ImportSessionProvider } from '@/features/translations/application/ImportSessionProvider';
import { colors } from '@/theme/tokens';

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1 },
      mutations: { retry: 0 },
    },
  }));
  const [fontsLoaded] = useFonts({
    Amiri_400Regular,
    Amiri_700Bold,
    CormorantGaramond_500Medium,
    CormorantGaramond_600SemiBold,
    CormorantGaramond_600SemiBold_Italic,
    CormorantGaramond_700Bold,
  });

  if (!fontsLoaded) return <LoadingFolio label="Setting the pages…" />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <SQLiteProvider
          databaseName="quran-uthmani-v1.1.sqlite"
          // Metro requires a static CommonJS asset reference for bundled SQLite files.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          assetSource={{ assetId: require('../../assets/data/quran.sqlite') }}
          onInit={initializeQuranDatabase}
        >
          <UserDatabaseProvider>
            <ImportSessionProvider>
              <SpeechProvider>
                <StatusBar style="dark" />
                <Stack screenOptions={{ contentStyle: { backgroundColor: colors.paper }, headerShown: false }}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="surah/[surahNumber]" />
                  <Stack.Screen name="translations/import" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="translations/import-preview" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="translations/[translationId]" />
                </Stack>
              </SpeechProvider>
            </ImportSessionProvider>
          </UserDatabaseProvider>
        </SQLiteProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
