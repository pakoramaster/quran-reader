import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyFolio } from '@/components/EmptyFolio';
import { FolioButton } from '@/components/FolioButton';
import { FolioScreen } from '@/components/FolioScreen';
import { useUserDatabase } from '@/data/databases/UserDatabaseProvider';
import { useSpeech } from '@/features/speech/application/SpeechProvider';
import { useImportSession } from '@/features/translations/application/ImportSessionProvider';
import { installTranslation } from '@/features/translations/data/translationRepository';
import { requestConfirmation, showMessage } from '@/platform/dialogs/dialogs';
import { colors, fontFamilies, spacing } from '@/theme/tokens';

export default function ImportPreviewScreen() {
  const db = useUserDatabase();
  const queryClient = useQueryClient();
  const speech = useSpeech();
  const { session, setSession } = useImportSession();
  const install = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error('The import session expired.');
      await speech.stop();
      return installTranslation(db, session.manifest, session.checksum);
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['translations'] }),
        queryClient.invalidateQueries({ queryKey: ['active-translation'] }),
        queryClient.invalidateQueries({ queryKey: ['active-translation-id'] }),
        queryClient.invalidateQueries({ queryKey: ['translation-verses'] }),
      ]);
      setSession(null);
      showMessage(result === 'replaced' ? 'Translation replaced' : 'Translation installed',
        result === 'replaced'
          ? 'The imported text was replaced atomically. Notes and highlights were preserved.'
          : 'The translation is now active and available offline.');
      router.replace('/translations');
    },
  });

  if (!session) {
    return <EmptyFolio actionLabel="Start again" body="Choose the JSON file again to create a fresh preview." glyph="↺" onAction={() => router.replace('/translations/import')} title="Import session expired" />;
  }

  const replacement = session.changedVerseCount !== null;
  const verseCount = session.manifest.verses.length;
  const coverage = Math.round((verseCount / 6236) * 100);
  const installAfterRightsCheck = () => {
    if (session.sourceFormat !== 'quran-db') {
      install.mutate();
      return;
    }
    requestConfirmation({
      title: 'Confirm your right to use this text',
      message: 'The source repository does not specify a licence for this translation. Continue only if you are authorized to use it.',
      confirmLabel: 'I am authorized',
      onConfirm: () => install.mutate(),
    });
  };
  const confirm = () => {
    if (replacement) {
      requestConfirmation({
        title: 'Replace this translation?',
        message: `${session.changedVerseCount?.toLocaleString()} verses differ. The replacement is atomic and your annotations will be retained.`,
        confirmLabel: 'Replace',
        destructive: true,
        onConfirm: installAfterRightsCheck,
      });
      return;
    }
    installAfterRightsCheck();
  };

  return (
    <FolioScreen
      action={<Pressable accessibilityLabel="Close preview" onPress={() => router.back()} style={styles.close}><Ionicons color={colors.ink} name="close" size={24} /></Pressable>}
      eyebrow={replacement ? 'Replacement preview' : 'New translation preview'}
      subtitle="Review the identity and attribution before anything is written to your private library."
      title="Ready to import"
    >
      <View style={styles.heroCard}>
        <Text style={styles.language}>{session.manifest.language.toUpperCase()}</Text>
        <Text style={styles.title}>{session.manifest.title}</Text>
        <Text style={styles.translator}>Translated by {session.manifest.translator}</Text>
        <View style={styles.rule} />
        <View style={styles.statRow}>
          <View><Text style={styles.statValue}>{verseCount.toLocaleString()}</Text><Text style={styles.statLabel}>VERSES</Text></View>
          <View><Text style={styles.statValue}>{replacement ? session.changedVerseCount?.toLocaleString() : 'NEW'}</Text><Text style={styles.statLabel}>{replacement ? 'CHANGED' : 'IMPORT'}</Text></View>
          <View><Text style={styles.statValue}>{coverage}%</Text><Text style={styles.statLabel}>COVERAGE</Text></View>
        </View>
      </View>

      <View style={styles.details}>
        <Detail label="Translation ID" value={session.manifest.id} />
        <Detail label="File" value={session.fileName} />
        <Detail label="Detected format" value={session.sourceFormat === 'quran-db' ? 'faisalill/quran_db' : 'Quran Folio JSON v1'} />
        <Detail label="Source" value={session.manifest.source.name} />
        <Detail label="License declaration" value={session.manifest.license.name} />
        <Detail label="SHA-256" value={session.checksum} mono />
      </View>
      {replacement ? (
        <View style={styles.notice}>
          <Ionicons color={colors.gold} name="shield-checkmark-outline" size={24} />
          <Text style={styles.noticeText}>The existing translation remains readable if any write fails. Notes and highlights are keyed independently and will be retained.</Text>
        </View>
      ) : null}
      {session.sourceFormat === 'quran-db' ? (
        <View style={styles.notice}>
          <Ionicons color={colors.gold} name="document-lock-outline" size={24} />
          <Text style={styles.noticeText}>The source repository does not declare redistribution rights for this text. Import only if you are authorized to use it.</Text>
        </View>
      ) : null}
      <View style={styles.actions}>
        <FolioButton label="Back" onPress={() => router.back()} style={styles.action} variant="quiet" />
        <FolioButton label={replacement ? 'Replace translation' : 'Install translation'} loading={install.isPending} onPress={confirm} style={styles.action} />
      </View>
      {install.error ? <Text style={styles.error}>{install.error.message}</Text> : null}
    </FolioScreen>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <View style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text numberOfLines={2} style={[styles.detailValue, mono ? styles.mono : null]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  close: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  heroCard: { backgroundColor: colors.emerald, borderRadius: 3, padding: spacing.lg },
  language: { color: colors.goldLight, fontFamily: fontFamilies.bodyBold, fontSize: 11, letterSpacing: 1.8 },
  title: { color: colors.paperLight, fontFamily: fontFamilies.display, fontSize: 32, marginTop: 5 },
  translator: { color: colors.goldLight, fontFamily: fontFamilies.body, fontSize: 17 },
  rule: { backgroundColor: colors.gold, height: 1, marginVertical: 18, opacity: 0.8 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statValue: { color: colors.paperLight, fontFamily: fontFamilies.display, fontSize: 25 },
  statLabel: { color: colors.goldLight, fontFamily: fontFamilies.bodyBold, fontSize: 9, letterSpacing: 1.2 },
  details: { marginTop: 20 },
  detailRow: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, gap: 6, paddingVertical: 12 },
  detailLabel: { color: colors.inkMuted, fontFamily: fontFamilies.bodyBold, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase' },
  detailValue: { color: colors.ink, fontFamily: fontFamilies.body, fontSize: 17 },
  mono: { fontFamily: 'monospace', fontSize: 11 },
  notice: { alignItems: 'flex-start', backgroundColor: colors.paperLight, borderColor: colors.border, borderWidth: 1, flexDirection: 'row', gap: 12, marginTop: 18, padding: 14 },
  noticeText: { color: colors.inkMuted, flex: 1, fontFamily: fontFamilies.body, fontSize: 16, lineHeight: 21 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  action: { flex: 1 },
  error: { color: colors.danger, fontFamily: fontFamilies.bodyBold, marginTop: 12, textAlign: 'center' },
});
