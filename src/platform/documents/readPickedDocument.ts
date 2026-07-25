import type { DocumentPickerAsset } from 'expo-document-picker';
import { File as ExpoFile } from 'expo-file-system';

export function readPickedDocument(document: DocumentPickerAsset): Promise<string> {
  return new ExpoFile(document.uri).text();
}
