import type { SQLiteDatabase } from 'expo-sqlite';

export async function initializeQuranDatabase(db: SQLiteDatabase): Promise<void> {
  const counts = await db.getFirstAsync<{ surahs: number; ayahs: number }>(`
    SELECT
      (SELECT COUNT(*) FROM surahs) AS surahs,
      (SELECT COUNT(*) FROM ayahs) AS ayahs
  `);
  if (counts?.surahs !== 114 || counts.ayahs !== 6236) {
    throw new Error('The bundled Quran database failed its integrity check.');
  }
  await db.execAsync('PRAGMA query_only = ON;');
}
