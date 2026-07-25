import type { SQLiteDatabase } from 'expo-sqlite';

export function runAtomicWrite(
  database: SQLiteDatabase,
  task: (transaction: SQLiteDatabase) => Promise<void>,
): Promise<void> {
  return database.withExclusiveTransactionAsync(task);
}
