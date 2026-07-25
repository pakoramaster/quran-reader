import type { SQLiteDatabase } from 'expo-sqlite';

import { runAtomicWrite as runNativeAtomicWrite } from '@/platform/database/runAtomicWrite';
import { runAtomicWrite as runWebAtomicWrite } from '@/platform/database/runAtomicWrite.web';

describe('runAtomicWrite', () => {
  it('uses the web-supported transaction and same connection on web', async () => {
    const withTransactionAsync = jest.fn(async (callback: () => Promise<void>) => callback());
    const database = { withTransactionAsync } as unknown as SQLiteDatabase;
    const task = jest.fn().mockResolvedValue(undefined);

    await runWebAtomicWrite(database, task);

    expect(withTransactionAsync).toHaveBeenCalledTimes(1);
    expect(task).toHaveBeenCalledWith(database);
  });

  it('uses an exclusive transaction connection on native platforms', async () => {
    const transaction = {} as SQLiteDatabase;
    const withExclusiveTransactionAsync = jest.fn(async (callback: (db: SQLiteDatabase) => Promise<void>) => callback(transaction));
    const database = { withExclusiveTransactionAsync } as unknown as SQLiteDatabase;
    const task = jest.fn().mockResolvedValue(undefined);

    await runNativeAtomicWrite(database, task);

    expect(withExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
    expect(task).toHaveBeenCalledWith(transaction);
  });
});
