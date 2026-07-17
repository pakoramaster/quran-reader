import type { SQLiteDatabase } from 'expo-sqlite';
import * as SQLite from 'expo-sqlite';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies } from '@/theme/tokens';
import { migrateUserDatabase } from './migrations';

const UserDatabaseContext = createContext<SQLiteDatabase | null>(null);

export function UserDatabaseProvider({ children }: PropsWithChildren) {
  const [database, setDatabase] = useState<SQLiteDatabase | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    let opened: SQLiteDatabase | null = null;
    void (async () => {
      try {
        opened = await SQLite.openDatabaseAsync('quran-folio-user.sqlite');
        await migrateUserDatabase(opened);
        if (active) setDatabase(opened);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught : new Error('Could not open local storage.'));
      }
    })();

    return () => {
      active = false;
      if (opened) void opened.closeAsync();
    };
  }, []);

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>The folio could not be opened</Text>
        <Text style={styles.message}>{error.message}</Text>
      </View>
    );
  }

  if (!database) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.gold} size="large" />
        <Text style={styles.message}>Preparing your private library…</Text>
      </View>
    );
  }

  return <UserDatabaseContext.Provider value={database}>{children}</UserDatabaseContext.Provider>;
}

export function useUserDatabase(): SQLiteDatabase {
  const database = useContext(UserDatabaseContext);
  if (!database) throw new Error('useUserDatabase must be used within UserDatabaseProvider.');
  return database;
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    backgroundColor: colors.paper,
    flex: 1,
    gap: 16,
    justifyContent: 'center',
    padding: 32,
  },
  title: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 28, textAlign: 'center' },
  message: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 18, textAlign: 'center' },
});
