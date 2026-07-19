import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FolioButton } from '@/components/FolioButton';
import { FolioScreen } from '@/components/FolioScreen';
import { useUserDatabase } from '@/data/databases/UserDatabaseProvider';
import { listCanonicalVerseKeys } from '@/features/quran-reader/data/quranRepository';
import { useImportSession } from '@/features/translations/application/ImportSessionProvider';
import { countChangedVerses } from '@/features/translations/data/translationRepository';
import {
  MAX_TRANSLATION_FILE_BYTES,
  validateTranslationFile,
} from '@/features/translations/domain/translationFormat';
import { colors, fontFamilies, spacing } from '@/theme/tokens';

export default function ImportTranslationScreen() {
  const quranDb = useSQLiteContext();
  const userDb = useUserDatabase();
  const canonicalKeys = useQuery({
    queryKey: ['canonical-verse-keys'],
    queryFn: () => listCanonicalVerseKeys(quranDb),
    staleTime: Infinity,
  });
  const { issues, setIssues, setSession } = useImportSession();
  const [loading, setLoading] = useState(false);

  const chooseFile = async () => {
    setLoading(true);
    setIssues([]);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: ['application/json', 'text/json'],
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      if (asset.size && asset.size > MAX_TRANSLATION_FILE_BYTES) {
        setIssues([{ code: 'schema', message: 'The file is larger than the 10 MB import limit.' }]);
        return;
      }
      const file = new File(asset.uri);
      const raw = await file.text();
      if (new TextEncoder().encode(raw).byteLength > MAX_TRANSLATION_FILE_BYTES) {
        setIssues([{ code: 'schema', message: 'The file is larger than the 10 MB import limit.' }]);
        return;
      }
      const validation = validateTranslationFile(raw, canonicalKeys.data ?? [], asset.name);
      if (!validation.ok) {
        setIssues(validation.issues);
        return;
      }
      const checksum = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
      const changedVerseCount = await countChangedVerses(userDb, validation.manifest);
      setSession({
        fileName: asset.name,
        checksum,
        manifest: validation.manifest,
        changedVerseCount,
        sourceFormat: validation.sourceFormat,
      });
      router.push('/translations/import-preview');
    } catch (error) {
      setIssues([{ code: 'schema', message: error instanceof Error ? error.message : 'The file could not be read.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <FolioScreen
      action={
        <Pressable accessibilityLabel="Close import" onPress={() => router.back()} style={styles.close}>
          <Ionicons color={colors.ink} name="close" size={24} />
        </Pressable>
      }
      eyebrow="Local document import"
      subtitle="The file is validated on this device and is never uploaded. Existing translations remain untouched until you confirm."
      title="Import a translation"
    >
      <View style={styles.dropZone}>
        <View style={styles.documentMark}>
          <Ionicons color={colors.gold} name="document-text-outline" size={38} />
        </View>
        <Text style={styles.dropTitle}>Choose a translation JSON file</Text>
        <Text style={styles.dropBody}>Quran Folio manifests and faisalill/quran_db files are recognized automatically.</Text>
        <FolioButton
          disabled={!canonicalKeys.data}
          label="Open document picker"
          loading={loading}
          onPress={() => void chooseFile()}
          style={styles.choose}
        />
      </View>

      {issues.length ? (
        <View style={styles.errorPanel}>
          <View style={styles.errorHeading}>
            <Ionicons color={colors.danger} name="alert-circle" size={22} />
            <Text style={styles.errorTitle}>This file needs attention</Text>
          </View>
          {issues.slice(0, 12).map((issue, index) => (
            <Text key={`${issue.code}-${issue.verseKey ?? index}`} style={styles.errorText}>• {issue.message}</Text>
          ))}
          {issues.length > 12 ? <Text style={styles.moreErrors}>And {issues.length - 12} more issues.</Text> : null}
        </View>
      ) : null}

      <View style={styles.specPanel}>
        <Text style={styles.specEyebrow}>SUPPORTED FORMATS</Text>
        <Text style={styles.specText}>Quran Folio JSON v1 with explicit metadata and complete verse coverage</Text>
        <Text style={styles.specText}>faisalill/quran_db nested Surah/Ayah JSON</Text>
        <Text style={styles.specEyebrow}>QURAN FOLIO MANIFEST</Text>
        <Text style={styles.specText}>format · version · id · title · language · translator</Text>
        <Text style={styles.specText}>source name/URL · license name/URL · verses[]</Text>
        <View style={styles.codeLine}>
          <Text style={styles.code}>{'{ "key": "2:255", "text": "…" }'}</Text>
        </View>
        <Text style={styles.specFootnote}>The array form makes duplicate verse keys detectable before import.</Text>
      </View>
    </FolioScreen>
  );
}

const styles = StyleSheet.create({
  close: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  dropZone: { alignItems: 'center', backgroundColor: colors.paperLight, borderColor: colors.gold, borderRadius: 4, borderStyle: 'dashed', borderWidth: 1, padding: spacing.xl },
  documentMark: { alignItems: 'center', borderColor: colors.goldLight, borderRadius: 38, borderWidth: 1, height: 76, justifyContent: 'center', width: 76 },
  dropTitle: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 27, marginTop: 16, textAlign: 'center' },
  dropBody: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 17, lineHeight: 22, marginTop: 4, textAlign: 'center' },
  choose: { marginTop: 22, minWidth: 220 },
  errorPanel: { backgroundColor: '#F8E9E5', borderColor: '#E3B6AF', borderRadius: 3, borderWidth: 1, marginTop: 18, padding: 16 },
  errorHeading: { alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 8 },
  errorTitle: { color: colors.danger, fontFamily: fontFamilies.display, fontSize: 22 },
  errorText: { color: colors.ink, fontFamily: fontFamilies.body, fontSize: 16, lineHeight: 22 },
  moreErrors: { color: colors.danger, fontFamily: fontFamilies.bodyBold, marginTop: 8 },
  specPanel: { borderTopColor: colors.border, borderTopWidth: 1, marginTop: 28, paddingTop: 22 },
  specEyebrow: { color: colors.gold, fontFamily: fontFamilies.bodyBold, fontSize: 11, letterSpacing: 1.5 },
  specText: { color: colors.ink, fontFamily: fontFamilies.body, fontSize: 17, lineHeight: 24 },
  codeLine: { backgroundColor: colors.emerald, borderRadius: 2, marginVertical: 12, padding: 14 },
  code: { color: colors.paperLight, fontFamily: 'monospace', fontSize: 13 },
  specFootnote: { color: colors.inkMuted, fontFamily: fontFamilies.displayItalic, fontSize: 16 },
});
