const mockWrite = jest.fn();
const mockFile = jest.fn().mockImplementation(() => ({ write: mockWrite }));
const mockRequestDirectoryPermissionsAsync = jest.fn();
const mockCreateFileAsync = jest.fn();
const mockShareAsync = jest.fn();

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: mockFile, Paths: { cache: 'cache' } }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: mockShareAsync }));

const legacyFileSystem = jest.requireMock('expo-file-system/legacy');
legacyFileSystem.StorageAccessFramework = {
  createFileAsync: mockCreateFileAsync,
  getUriForDirectoryInRoot: jest.fn(() => 'content://downloads'),
  requestDirectoryPermissionsAsync: mockRequestDirectoryPermissionsAsync,
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Platform } = require('react-native');
Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });

// Require after extending jest-expo's filesystem mock above.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { saveBackupFile } = require('@/platform/backups/backupFiles');

describe('Android backup files', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('writes the backup into the directory selected by the user', async () => {
    mockRequestDirectoryPermissionsAsync.mockResolvedValue({ directoryUri: 'content://chosen-folder', granted: true });
    mockCreateFileAsync.mockResolvedValue('content://chosen-folder/backup');
    const bytes = Uint8Array.from([1, 2, 3]);

    await expect(saveBackupFile(bytes, 'backup.quranfolio')).resolves.toBe(true);
    expect(mockRequestDirectoryPermissionsAsync).toHaveBeenCalledWith('content://downloads');
    expect(mockCreateFileAsync).toHaveBeenCalledWith('content://chosen-folder', 'backup.quranfolio', 'application/zip');
    expect(mockFile).toHaveBeenCalledWith('content://chosen-folder/backup');
    expect(mockWrite).toHaveBeenCalledWith(bytes);
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  it('cancels without creating or sharing a file', async () => {
    mockRequestDirectoryPermissionsAsync.mockResolvedValue({ directoryUri: null, granted: false });

    await expect(saveBackupFile(Uint8Array.from([1]), 'backup.quranfolio')).resolves.toBe(false);
    expect(mockCreateFileAsync).not.toHaveBeenCalled();
    expect(mockShareAsync).not.toHaveBeenCalled();
  });
});
