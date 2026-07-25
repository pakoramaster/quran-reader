import type { DocumentPickerAsset } from 'expo-document-picker';

export function readPickedDocument(document: DocumentPickerAsset): Promise<string> {
  if (!document.file) throw new Error('The selected browser file is unavailable. Please choose it again.');
  return document.file.text();
}
