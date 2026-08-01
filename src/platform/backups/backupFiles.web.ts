import * as DocumentPicker from 'expo-document-picker';

export async function saveBackupFile(bytes: Uint8Array, fileName: string): Promise<boolean> {
  const blob = new Blob([bytes.slice().buffer], { type: 'application/zip' });
  const uri = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = uri;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(uri), 1_000);
  return true;
}

export async function pickBackupFile(): Promise<Uint8Array | null> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: ['application/zip', 'application/octet-stream'],
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  const buffer = asset.file ? await asset.file.arrayBuffer() : await (await fetch(asset.uri)).arrayBuffer();
  return new Uint8Array(buffer);
}
