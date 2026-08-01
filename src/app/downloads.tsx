import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { FolioHeader, FolioScreen } from '@/components/FolioScreen';
import { LoadingFolio } from '@/components/LoadingFolio';
import { useUserDatabase } from '@/data/databases/UserDatabaseProvider';
import { listSurahs } from '@/features/quran-reader/data/quranRepository';
import {
  downloadSurahRecitation,
  listRecitationDownloads,
  removeSurahRecitation,
} from '@/features/recitation/data/recitationDownloadRepository';
import { RECITERS, type ReciterId } from '@/features/recitation/domain/reciters';
import { requestConfirmation, showMessage } from '@/platform/dialogs/dialogs';
import { colors, fontFamilies, spacing } from '@/theme/tokens';
import type { Surah, VerseKey } from '@/types/domain';

interface DownloadProgress {
  reciterId: ReciterId;
  surahNumber: number;
  completed: number;
  total: number;
}

export default function RecitationDownloadsScreen() {
  const quranDb = useSQLiteContext();
  const userDb = useUserDatabase();
  const queryClient = useQueryClient();
  const [reciterId, setReciterId] = useState<ReciterId>('husary');
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const surahs = useQuery({ queryKey: ['surahs'], queryFn: () => listSurahs(quranDb), staleTime: Infinity });
  const downloads = useQuery({ queryKey: ['recitation-downloads'], queryFn: () => listRecitationDownloads(userDb) });
  const downloadedBySurah = useMemo(
    () => new Map(downloads.data?.filter((item) => item.reciterId === reciterId).map((item) => [item.surahNumber, item])),
    [downloads.data, reciterId],
  );
  const download = useMutation({
    mutationFn: async ({ reciter, surah }: { reciter: ReciterId; surah: Surah }) => {
      const verseKeys = Array.from({ length: surah.ayahCount }, (_, index) => `${surah.number}:${index + 1}` as VerseKey);
      setProgress({ reciterId: reciter, surahNumber: surah.number, completed: 0, total: verseKeys.length });
      return downloadSurahRecitation(userDb, reciter, surah.number, verseKeys, (completed, total) => {
        setProgress({ reciterId: reciter, surahNumber: surah.number, completed, total });
      });
    },
    onError: (error) => showMessage('Download interrupted', error instanceof Error ? error.message : 'The Surah could not be downloaded.'),
    onSettled: async () => {
      setProgress(null);
      await queryClient.invalidateQueries({ queryKey: ['recitation-downloads'] });
    },
  });
  const remove = useMutation({
    mutationFn: ({ reciter, surahNumber }: { reciter: ReciterId; surahNumber: number }) => removeSurahRecitation(userDb, reciter, surahNumber),
    onError: (error) => showMessage('Could not remove download', error instanceof Error ? error.message : 'The stored audio could not be removed.'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recitation-downloads'] }),
  });
  const totalBytes = downloads.data?.reduce((sum, item) => sum + item.byteCount, 0) ?? 0;

  const confirmRemove = (surah: Surah) => requestConfirmation({
    title: `Remove ${surah.nameTransliterated}?`,
    message: 'The app will stream this recitation again when you play it online.',
    confirmLabel: 'Remove download',
    destructive: true,
    onConfirm: () => remove.mutate({ reciter: reciterId, surahNumber: surah.number }),
  });

  return (
    <FolioScreen contentStyle={styles.screen} safeBottom scroll={false}>
      <FlatList
        contentContainerStyle={styles.list}
        data={surahs.data ?? []}
        keyExtractor={(item) => String(item.number)}
        ListEmptyComponent={surahs.isLoading ? <LoadingFolio label="Opening the Surah list…" /> : null}
        ListHeaderComponent={(
          <>
            <FolioHeader
              action={<Pressable accessibilityLabel="Close downloads" onPress={() => router.back()} style={styles.close}><Ionicons color={colors.ink} name="close" size={24} /></Pressable>}
              eyebrow="Listen without a connection"
              subtitle="Choose a reciter, then save individual Surahs. Downloaded verses are used automatically before streaming."
              title="Recitation downloads"
            />
            <View style={styles.summary}>
              <Text style={styles.summaryLabel}>OFFLINE AUDIO</Text>
              <Text style={styles.summaryValue}>{downloads.data?.length ?? 0} Surahs · {formatBytes(totalBytes)}</Text>
            </View>
            <Text style={styles.pickerLabel}>RECITER</Text>
            <View style={styles.reciterPicker}>
              {RECITERS.map((reciter) => {
                const selected = reciter.id === reciterId;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    key={reciter.id}
                    onPress={() => setReciterId(reciter.id)}
                    style={[styles.reciter, selected ? styles.reciterSelected : null]}
                  >
                    <Text style={[styles.reciterName, selected ? styles.reciterNameSelected : null]}>{reciter.name}</Text>
                    <Text style={[styles.reciterMeta, selected ? styles.reciterMetaSelected : null]}>{reciter.style}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.pickerLabel}>SURAHS</Text>
          </>
        )}
        renderItem={({ item }) => {
          const stored = downloadedBySurah.get(item.number);
          const activeProgress = progress?.reciterId === reciterId && progress.surahNumber === item.number ? progress : null;
          const busy = download.isPending || remove.isPending;
          return (
            <View style={styles.surahRow}>
              <Text style={styles.surahNumber}>{item.number}</Text>
              <View style={styles.surahCopy}>
                <Text style={styles.surahName}>{item.nameTransliterated}</Text>
                <Text style={styles.surahMeta}>
                  {activeProgress
                    ? `${activeProgress.completed} of ${activeProgress.total} Ayahs`
                    : stored ? `${stored.verseCount} Ayahs · ${formatBytes(stored.byteCount)} stored` : `${item.ayahCount} Ayahs`}
                </Text>
              </View>
              {activeProgress ? (
                <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.round((activeProgress.completed / activeProgress.total) * 100)}%` }]} /></View>
              ) : stored ? (
                <Pressable accessibilityLabel={`Remove ${item.nameTransliterated} download`} disabled={busy} onPress={() => confirmRemove(item)} style={styles.rowAction}>
                  <Ionicons color={colors.oxblood} name="trash-outline" size={20} />
                </Pressable>
              ) : (
                <Pressable accessibilityLabel={`Download ${item.nameTransliterated}`} disabled={busy} onPress={() => download.mutate({ reciter: reciterId, surah: item })} style={styles.rowAction}>
                  <Ionicons color={colors.emerald} name="download-outline" size={21} />
                </Pressable>
              )}
            </View>
          );
        }}
        showsVerticalScrollIndicator={false}
      />
    </FolioScreen>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0 },
  list: { paddingBottom: spacing.xl },
  close: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  summary: { backgroundColor: colors.emerald, borderRadius: 3, marginBottom: 18, padding: 16 },
  summaryLabel: { color: colors.goldLight, fontFamily: fontFamilies.bodyBold, fontSize: 10, letterSpacing: 1.4 },
  summaryValue: { color: colors.paperLight, fontFamily: fontFamilies.display, fontSize: 24, marginTop: 2 },
  pickerLabel: { color: colors.gold, fontFamily: fontFamilies.bodyBold, fontSize: 10, letterSpacing: 1.5, marginBottom: 8, marginTop: 8 },
  reciterPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
  reciter: { borderColor: colors.border, borderRadius: 3, borderWidth: 1, flexGrow: 1, minWidth: 220, padding: 13 },
  reciterSelected: { backgroundColor: colors.emerald, borderColor: colors.emerald },
  reciterName: { color: colors.ink, fontFamily: fontFamilies.bodyBold, fontSize: 16 },
  reciterNameSelected: { color: colors.paperLight },
  reciterMeta: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 13 },
  reciterMetaSelected: { color: colors.goldLight },
  surahRow: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, minHeight: 66, paddingVertical: 9 },
  surahNumber: { color: colors.gold, fontFamily: fontFamilies.bodyBold, fontSize: 13, textAlign: 'center', width: 28 },
  surahCopy: { flex: 1 },
  surahName: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 20 },
  surahMeta: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 13 },
  rowAction: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  progressTrack: { backgroundColor: colors.paperDeep, borderRadius: 4, height: 7, overflow: 'hidden', width: 74 },
  progressFill: { backgroundColor: colors.emerald, height: '100%' },
});
