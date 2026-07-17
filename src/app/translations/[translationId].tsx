import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyFolio } from '@/components/EmptyFolio';
import { FolioButton } from '@/components/FolioButton';
import { FolioScreen } from '@/components/FolioScreen';
import { LoadingFolio } from '@/components/LoadingFolio';
import { useUserDatabase } from '@/data/databases/UserDatabaseProvider';
import { getTranslation } from '@/features/translations/data/translationRepository';
import { colors, fontFamilies, spacing } from '@/theme/tokens';

export default function TranslationDetailScreen() {
  const { translationId } = useLocalSearchParams<{ translationId: string }>();
  const db = useUserDatabase();
  const translation = useQuery({
    queryKey: ['translation', translationId],
    queryFn: () => getTranslation(db, translationId),
  });
  if (translation.isLoading) return <LoadingFolio label="Opening the translation record…" />;
  if (!translation.data) return <EmptyFolio body="This translation is not installed on this device." glyph="؟" title="Translation not found" />;
  const item = translation.data;
  return (
    <FolioScreen
      action={<Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}><Ionicons color={colors.ink} name="arrow-back" size={23} /></Pressable>}
      eyebrow={item.language}
      subtitle={`A complete, immutable local copy imported on ${new Date(item.importedAt).toLocaleDateString()}.`}
      title={item.title}
    >
      <View style={styles.attribution}>
        <Text style={styles.translator}>Translated by {item.translator}</Text>
        <Text style={styles.source}>{item.sourceName}</Text>
      </View>
      <View style={styles.details}>
        <Detail label="Local ID" value={item.id} />
        <Detail label="Coverage" value={`${item.verseCount.toLocaleString()} ayahs`} />
        <Detail label="Language" value={item.language} />
        <Detail label="License declaration" value={item.licenseName} />
        <Detail label="Last imported" value={new Date(item.updatedAt).toLocaleString()} />
        <Detail label="SHA-256" value={item.contentSha256} mono />
      </View>
      {item.sourceUrl ? <FolioButton label="Open source page" onPress={() => void Linking.openURL(item.sourceUrl!)} variant="secondary" /> : null}
      {item.licenseUrl ? <FolioButton label="Open license page" onPress={() => void Linking.openURL(item.licenseUrl!)} style={styles.linkButton} variant="quiet" /> : null}
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>About re-importing</Text>
        <Text style={styles.noticeBody}>Choose a file with the same translation ID. You will see how many verses changed before confirming, and all notes and highlights will remain attached to their verse keys.</Text>
      </View>
      <FolioButton label="Re-import this translation" onPress={() => router.push('/translations/import')} style={styles.reimport} />
    </FolioScreen>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <View style={styles.detail}><Text style={styles.label}>{label}</Text><Text selectable style={[styles.value, mono ? styles.mono : null]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  back: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  attribution: { backgroundColor: colors.emerald, borderRadius: 3, padding: spacing.lg },
  translator: { color: colors.paperLight, fontFamily: fontFamilies.display, fontSize: 27 },
  source: { color: colors.goldLight, fontFamily: fontFamilies.body, fontSize: 17 },
  details: { marginVertical: 20 },
  detail: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 12 },
  label: { color: colors.inkMuted, fontFamily: fontFamilies.bodyBold, fontSize: 10, letterSpacing: 1.3, textTransform: 'uppercase' },
  value: { color: colors.ink, fontFamily: fontFamilies.body, fontSize: 18, marginTop: 3 },
  mono: { fontFamily: 'monospace', fontSize: 11 },
  linkButton: { marginTop: 10 },
  notice: { backgroundColor: colors.paperLight, borderColor: colors.border, borderWidth: 1, marginTop: 22, padding: 16 },
  noticeTitle: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 22 },
  noticeBody: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 17, lineHeight: 23, marginTop: 4 },
  reimport: { marginTop: 16 },
});
