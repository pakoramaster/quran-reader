import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Expo SQLite does not support separate-connection exclusive transactions on
 * web. Its regular transaction still guarantees commit-or-rollback atomicity.
 */
export function runAtomicWrite(
  database: SQLiteDatabase,
  task: (transaction: SQLiteDatabase) => Promise<void>,
): Promise<void> {
  return database.withTransactionAsync(() => task(database));
}
