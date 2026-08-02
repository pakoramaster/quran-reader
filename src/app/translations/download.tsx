import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyFolio } from '@/components/EmptyFolio';
import { FolioButton } from '@/components/FolioButton';
import { FolioScreen } from '@/components/FolioScreen';
import { LoadingFolio } from '@/components/LoadingFolio';
import { useUserDatabase } from '@/data/databases/UserDatabaseProvider';
import { listCanonicalVerseKeys } from '@/features/quran-reader/data/quranRepository';
import { useImportSession } from '@/features/translations/application/ImportSessionProvider';
import {
  downloadQuranDbTranslation,
  formatQuranDbFileName,
  listQuranDbTranslations,
  type QuranDbCatalogItem,
} from '@/features/translations/data/quranDbCatalog';
import { countChangedVerses, listTranslations } from '@/features/translations/data/translationRepository';
import { quranDbTranslationIdFromFileName, validateTranslationFile } from '@/features/translations/domain/translationFormat';
import { showMessage } from '@/platform/dialogs/dialogs';
import { colors, fontFamilies, spacing } from '@/theme/tokens';

export default function DownloadTranslationsScreen() {
  const quranDb = useSQLiteContext();
  const userDb = useUserDatabase();
  const { setIssues, setSession } = useImportSession();
  const catalog = useQuery({ queryKey: ['quran-db-catalog'], queryFn: () => listQuranDbTranslations() });
  const canonicalKeys = useQuery({
    queryKey: ['canonical-verse-keys'],
    queryFn: () => listCanonicalVerseKeys(quranDb),
    staleTime: Infinity,
  });
  const installed = useQuery({ queryKey: ['translations'], queryFn: () => listTranslations(userDb) });
  const installedIds = new Set(installed.data?.map((translation) => translation.id));

  const download = useMutation({
    mutationFn: async (item: QuranDbCatalogItem) => {
      if (!canonicalKeys.data) throw new Error('The Quran verse index is still loading.');
      const raw = await downloadQuranDbTranslation(item);
      const validation = validateTranslationFile(raw, canonicalKeys.data, item.fileName);
      if (!validation.ok) {
        const details = validation.issues.slice(0, 3).map((issue) => issue.message).join('\n');
        throw new Error(`This repository file could not be imported.\n${details}`);
      }
      const checksum = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
      const changedVerseCount = await countChangedVerses(userDb, validation.manifest);
      setIssues([]);
      setSession({
        fileName: item.fileName,
        checksum,
        manifest: validation.manifest,
        changedVerseCount,
        sourceFormat: validation.sourceFormat,
      });
    },
    onSuccess: () => router.push('/translations/import-preview'),
    onError: (error) => showMessage(
      'Could not download translation',
      error instanceof Error ? error.message : 'The translation could not be downloaded.',
    ),
  });

  return (
    <FolioScreen
      action={
        <Pressable accessibilityLabel="Close translation downloads" onPress={() => router.back()} style={styles.close}>
          <Ionicons color={colors.ink} name="close" size={24} />
        </Pressable>
      }
      eyebrow="Online collection"
      safeBottom
      subtitle="Download a JSON translation from faisalill/quran_db, review its attribution, then install it for offline reading."
      title="Download translations"
    >
      <View style={styles.notice}>
        <Ionicons color={colors.gold} name="information-circle-outline" size={24} />
        <Text style={styles.noticeText}>The repository does not specify licences for these texts. You will be asked to confirm your right to use a translation before installing it.</Text>
      </View>

      {catalog.isLoading ? <LoadingFolio label="Loading the translation catalog…" /> : null}
      {catalog.isError ? (
        <EmptyFolio
          actionLabel="Try again"
          body={catalog.error instanceof Error ? catalog.error.message : 'The catalog could not be loaded.'}
          glyph="↻"
          onAction={() => void catalog.refetch()}
          title="Catalog unavailable"
        />
      ) : null}
      {catalog.data?.map((item) => {
        const isInstalled = installedIds.has(quranDbTranslationIdFromFileName(item.fileName));
        const isDownloading = download.isPending && download.variables?.fileName === item.fileName;
        return (
          <View key={item.fileName} style={styles.row}>
            <View style={styles.copy}>
              <Text style={styles.name}>{formatQuranDbFileName(item.fileName)}</Text>
              <Text style={styles.meta}>{item.fileName}{isInstalled ? ' · INSTALLED' : ''}</Text>
            </View>
            <FolioButton
              disabled={!canonicalKeys.data || (download.isPending && !isDownloading)}
              label={isInstalled ? 'Review update' : 'Download'}
              loading={isDownloading}
              onPress={() => download.mutate(item)}
              style={styles.download}
              variant={isInstalled ? 'quiet' : 'secondary'}
            />
          </View>
        );
      })}
    </FolioScreen>
  );
}

const styles = StyleSheet.create({
  close: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  notice: { alignItems: 'flex-start', backgroundColor: colors.paperLight, borderColor: colors.border, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: spacing.lg, padding: 14 },
  noticeText: { color: colors.inkMuted, flex: 1, fontFamily: fontFamilies.body, fontSize: 16, lineHeight: 21 },
  row: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, minHeight: 76, paddingVertical: 10 },
  copy: { flex: 1 },
  name: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 21 },
  meta: { color: colors.inkMuted, fontFamily: fontFamilies.bodyBold, fontSize: 10, letterSpacing: 0.6, marginTop: 2 },
  download: { minWidth: 128 },
});
