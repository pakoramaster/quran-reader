import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyFolio } from '@/components/EmptyFolio';
import { FolioButton } from '@/components/FolioButton';
import { FolioScreen } from '@/components/FolioScreen';
import { LoadingFolio } from '@/components/LoadingFolio';
import { useUserDatabase } from '@/data/databases/UserDatabaseProvider';
import {
  getActiveTranslationId,
  listTranslations,
  setActiveTranslationId,
} from '@/features/translations/data/translationRepository';
import { colors, fontFamilies, spacing } from '@/theme/tokens';

export default function TranslationsScreen() {
  const db = useUserDatabase();
  const queryClient = useQueryClient();
  const translations = useQuery({ queryKey: ['translations'], queryFn: () => listTranslations(db) });
  const activeId = useQuery({ queryKey: ['active-translation-id'], queryFn: () => getActiveTranslationId(db) });
  const select = useMutation({
    mutationFn: (id: string) => setActiveTranslationId(db, id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['active-translation'] }),
        queryClient.invalidateQueries({ queryKey: ['active-translation-id'] }),
      ]);
    },
  });

  return (
    <FolioScreen
      action={<FolioButton label="Import translation" onPress={() => router.push('/translations/import')} />}
      eyebrow="Your reference shelf"
      subtitle="Each translation is kept exactly as imported. Re-importing the same ID replaces its text while preserving your annotations."
      title="Translations"
    >
      {translations.isLoading ? <LoadingFolio label="Reading your library…" /> : null}
      {!translations.isLoading && !translations.data?.length ? (
        <EmptyFolio
          actionLabel="Choose a JSON file"
          body="Import a complete 6,236-ayah translation to begin annotating and listening offline."
          glyph="ت"
          onAction={() => router.push('/translations/import')}
          title="Your shelf is empty"
        />
      ) : null}
      {translations.data?.map((translation) => {
        const active = activeId.data === translation.id;
        return (
          <Pressable
            accessibilityRole="button"
            key={translation.id}
            onPress={() => router.push({ pathname: '/translations/[translationId]', params: { translationId: translation.id } })}
            style={({ pressed }) => [styles.card, active ? styles.cardActive : null, pressed ? styles.cardPressed : null]}
          >
            <View style={styles.cardTopline}>
              <Text style={styles.language}>{translation.language.toUpperCase()}</Text>
              {active ? <Text style={styles.activeBadge}>ACTIVE</Text> : null}
            </View>
            <Text style={styles.title}>{translation.title}</Text>
            <Text style={styles.byline}>Translated by {translation.translator}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.meta}>{translation.verseCount.toLocaleString()} AYAHS</Text>
              <View style={styles.dot} />
              <Text numberOfLines={1} style={styles.meta}>{translation.licenseName}</Text>
            </View>
            <View style={styles.actions}>
              {!active ? (
                <FolioButton
                  label="Set active"
                  loading={select.isPending && select.variables === translation.id}
                  onPress={() => select.mutate(translation.id)}
                  style={styles.action}
                  variant="secondary"
                />
              ) : (
                <View style={styles.activeStatement}>
                  <Ionicons color={colors.emerald} name="checkmark-circle" size={19} />
                  <Text style={styles.activeStatementText}>Shown in the reader</Text>
                </View>
              )}
              <Ionicons color={colors.gold} name="chevron-forward" size={20} />
            </View>
          </Pressable>
        );
      })}
    </FolioScreen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.paperLight, borderColor: colors.border, borderRadius: 3, borderWidth: 1, marginBottom: 14, padding: 18 },
  cardActive: { borderColor: colors.gold, borderLeftWidth: 4 },
  cardPressed: { opacity: 0.75 },
  cardTopline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  language: { color: colors.gold, fontFamily: fontFamilies.bodyBold, fontSize: 11, letterSpacing: 1.5 },
  activeBadge: { backgroundColor: colors.emeraldLight, color: colors.emerald, fontFamily: fontFamilies.bodyBold, fontSize: 10, letterSpacing: 1, paddingHorizontal: 8, paddingVertical: 4 },
  title: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 27, marginTop: 8 },
  byline: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 17 },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 12 },
  meta: { color: colors.inkMuted, flexShrink: 1, fontFamily: fontFamilies.bodyBold, fontSize: 10, letterSpacing: 1 },
  dot: { backgroundColor: colors.gold, borderRadius: 2, height: 4, width: 4 },
  actions: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, marginTop: 16 },
  action: { minWidth: 120 },
  activeStatement: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 7 },
  activeStatementText: { color: colors.emerald, fontFamily: fontFamilies.bodyBold, fontSize: 15 },
});
