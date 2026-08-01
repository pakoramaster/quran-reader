import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function saveBackupFile(bytes: Uint8Array, fileName: string): Promise<void> {
  const file = new File(Paths.cache, fileName);
  file.create({ intermediates: true, overwrite: true });
  file.write(bytes);
  if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable on this device.');
  await Sharing.shareAsync(file.uri, { dialogTitle: 'Save Quran Folio backup', mimeType: 'application/zip' });
}

export async function pickBackupFile(): Promise<Uint8Array | null> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: ['application/zip', 'application/octet-stream'],
  });
  if (result.canceled || !result.assets[0]) return null;
  return new File(result.assets[0].uri).bytes();
}
