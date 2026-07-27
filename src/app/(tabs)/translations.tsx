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
  deleteTranslation,
  getActiveTranslationId,
  listTranslations,
  setActiveTranslationId,
} from '@/features/translations/data/translationRepository';
import { requestConfirmation, showMessage } from '@/platform/dialogs/dialogs';
import { colors, fontFamilies, spacing } from '@/theme/tokens';
import type { InstalledTranslation } from '@/types/domain';

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
  const remove = useMutation({
    mutationFn: (translation: InstalledTranslation) => deleteTranslation(db, translation.id),
    onSuccess: async (_deleted, translation) => {
      queryClient.removeQueries({ queryKey: ['translation', translation.id] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['translations'] }),
        queryClient.invalidateQueries({ queryKey: ['active-translation'] }),
        queryClient.invalidateQueries({ queryKey: ['active-translation-id'] }),
        queryClient.invalidateQueries({ queryKey: ['translation-verses'] }),
        queryClient.invalidateQueries({ queryKey: ['annotated-ayahs'] }),
        queryClient.invalidateQueries({ queryKey: ['annotations'] }),
      ]);
    },
    onError: (error) => showMessage('Could not delete translation', error.message),
  });

  const confirmDelete = (translation: InstalledTranslation) => {
    requestTranslationDeleteConfirmation(translation, () => remove.mutate(translation));
  };

  return (
    <FolioScreen
      eyebrow="Your reference shelf"
      subtitle="Each translation is kept exactly as imported. Re-importing the same ID replaces its text while preserving your annotations."
      title="Translations"
    >
      <FolioButton label="Import translation" onPress={() => router.push('/translations/import')} style={styles.importButton} />
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
          <TranslationCard
            active={active}
            deleting={remove.isPending && remove.variables?.id === translation.id}
            key={translation.id}
            onDelete={confirmDelete}
            onSelect={(item) => select.mutate(item.id)}
            selecting={select.isPending && select.variables === translation.id}
            translation={translation}
          />
        );
      })}
    </FolioScreen>
  );
}

export function requestTranslationDeleteConfirmation(
  translation: InstalledTranslation,
  onConfirm: () => void,
): void {
  requestConfirmation({
    title: 'Delete translation?',
    message: `Remove “${translation.title}” from this device? Its notes and highlights will also be permanently deleted.`,
    confirmLabel: 'Delete',
    destructive: true,
    onConfirm,
  });
}

interface TranslationCardProps {
  translation: InstalledTranslation;
  active: boolean;
  selecting: boolean;
  deleting: boolean;
  onSelect: (translation: InstalledTranslation) => void;
  onDelete: (translation: InstalledTranslation) => void;
}

export function TranslationCard({
  translation,
  active,
  selecting,
  deleting,
  onSelect,
  onDelete,
}: TranslationCardProps) {
  return (
    <View style={[styles.card, active ? styles.cardActive : null]}>
      <Pressable
        accessibilityLabel={`Open translation ${translation.title}`}
        accessibilityRole="button"
        onPress={() => router.push({
          pathname: '/translations/[translationId]',
          params: { translationId: translation.id },
        })}
        style={({ pressed }) => [styles.cardContent, pressed ? styles.cardPressed : null]}
      >
        <View style={styles.cardTopline}>
          <Text style={styles.language}>{translation.language.toUpperCase()}</Text>
          <View style={styles.cardToplineEnd}>
            {active ? <Text style={styles.activeBadge}>ACTIVE</Text> : null}
            <Ionicons color={colors.gold} name="chevron-forward" size={20} />
          </View>
        </View>
        <Text style={styles.title}>{translation.title}</Text>
        <Text style={styles.byline}>Translated by {translation.translator}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{translation.verseCount.toLocaleString()} AYAHS</Text>
          <View style={styles.dot} />
          <Text numberOfLines={1} style={styles.meta}>{translation.licenseName}</Text>
        </View>
      </Pressable>
      <View style={styles.actions}>
        {!active ? (
          <FolioButton
            label="Set active"
            loading={selecting}
            onPress={() => onSelect(translation)}
            style={styles.action}
            variant="secondary"
          />
        ) : (
          <View style={styles.activeStatement}>
            <Ionicons color={colors.emerald} name="checkmark-circle" size={19} />
            <Text style={styles.activeStatementText}>Shown in the reader</Text>
          </View>
        )}
        <Pressable
          accessibilityLabel={`Delete translation ${translation.title}`}
          accessibilityRole="button"
          disabled={deleting}
          onPress={() => onDelete(translation)}
          style={({ pressed }) => [
            styles.deleteAction,
            pressed ? styles.actionPressed : null,
            deleting ? styles.actionDisabled : null,
          ]}
        >
          <Ionicons color={colors.oxblood} name="trash-outline" size={18} />
          <Text style={styles.deleteActionLabel}>{deleting ? 'Deleting…' : 'Delete'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.paperLight, borderColor: colors.border, borderRadius: 3, borderWidth: 1, marginBottom: 14, overflow: 'hidden' },
  cardActive: { borderColor: colors.gold, borderLeftWidth: 4 },
  cardPressed: { opacity: 0.75 },
  cardContent: { padding: 18 },
  cardTopline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  cardToplineEnd: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  language: { color: colors.gold, fontFamily: fontFamilies.bodyBold, fontSize: 11, letterSpacing: 1.5 },
  activeBadge: { backgroundColor: colors.emeraldLight, color: colors.emerald, fontFamily: fontFamilies.bodyBold, fontSize: 10, letterSpacing: 1, paddingHorizontal: 8, paddingVertical: 4 },
  title: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 27, marginTop: 8 },
  byline: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 17 },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 12 },
  meta: { color: colors.inkMuted, flexShrink: 1, fontFamily: fontFamilies.bodyBold, fontSize: 10, letterSpacing: 1 },
  dot: { backgroundColor: colors.gold, borderRadius: 2, height: 4, width: 4 },
  actions: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, paddingHorizontal: 14, paddingVertical: 9 },
  action: { flex: 1, minWidth: 120 },
  activeStatement: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 7, minHeight: 48 },
  activeStatementText: { color: colors.emerald, fontFamily: fontFamilies.bodyBold, fontSize: 15 },
  deleteAction: { alignItems: 'center', flexDirection: 'row', gap: 6, minHeight: 48, paddingHorizontal: 12 },
  deleteActionLabel: { color: colors.oxblood, fontFamily: fontFamilies.bodyBold, fontSize: 15 },
  actionPressed: { opacity: 0.6 },
  actionDisabled: { opacity: 0.45 },
  importButton: { marginBottom: 18 },
});
