import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useDeferredValue, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyFolio } from '@/components/EmptyFolio';
import { FolioHeader, FolioScreen } from '@/components/FolioScreen';
import { LoadingFolio } from '@/components/LoadingFolio';
import { useUserDatabase } from '@/data/databases/UserDatabaseProvider';
import {
  deleteAnnotation,
  listAnnotatedAyahs,
  saveAnnotation,
} from '@/features/annotations/data/annotationRepository';
import { AnnotationEditor } from '@/features/annotations/ui/AnnotationEditor';
import { getAyah } from '@/features/quran-reader/data/quranRepository';
import { useReadingFontSize } from '@/features/settings/application/useReadingFontSize';
import { listTranslations } from '@/features/translations/data/translationRepository';
import { requestConfirmation, showMessage } from '@/platform/dialogs/dialogs';
import { FolioTextInput } from '@/platform/ui/FolioTextInput';
import { colors, fontFamilies } from '@/theme/tokens';
import type { AnnotatedAyah, HighlightColor, ReaderAyah } from '@/types/domain';

const highlightFilters: (HighlightColor | null)[] = [null, 'amber', 'sage', 'sky', 'rose'];

export default function NotesScreen() {
  const db = useUserDatabase();
  const quranDb = useSQLiteContext();
  const queryClient = useQueryClient();
  const readingFontSize = useReadingFontSize();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [translationId, setTranslationId] = useState<string | null>(null);
  const [color, setColor] = useState<HighlightColor | null>(null);
  const [editorAyah, setEditorAyah] = useState<ReaderAyah | null>(null);
  const translations = useQuery({ queryKey: ['translations'], queryFn: () => listTranslations(db) });
  const effectiveTranslationId = translationId && translations.data
    && !translations.data.some((item) => item.id === translationId)
    ? null
    : translationId;
  const annotations = useQuery({
    queryKey: ['annotated-ayahs', deferredSearch, effectiveTranslationId, color],
    queryFn: () => listAnnotatedAyahs(db, deferredSearch, effectiveTranslationId, color),
  });
  const selectedTranslationName = useMemo(
    () => translations.data?.find((item) => item.id === effectiveTranslationId)?.title ?? 'All translations',
    [effectiveTranslationId, translations.data],
  );

  const saveMutation = useMutation({
    mutationFn: ({
      ayah,
      note,
      highlight,
    }: {
      ayah: ReaderAyah;
      note: string | null;
      highlight: HighlightColor | null;
    }) => {
      if (!ayah.annotation) throw new Error('The note is no longer available.');
      return saveAnnotation(db, {
        translationId: ayah.annotation.translationId,
        surahNumber: ayah.surahNumber,
        ayahNumber: ayah.ayahNumber,
        noteText: note,
        highlightColor: highlight,
      });
    },
    onSuccess: async () => {
      setEditorAyah(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['annotated-ayahs'] }),
        queryClient.invalidateQueries({ queryKey: ['annotations'] }),
      ]);
    },
    onError: (error) => showMessage('Could not save note', error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (annotation: AnnotatedAyah) => deleteAnnotation(
      db,
      annotation.surahNumber,
      annotation.ayahNumber,
    ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['annotated-ayahs'] }),
        queryClient.invalidateQueries({ queryKey: ['annotations'] }),
      ]);
    },
    onError: (error) => showMessage('Could not delete note', error.message),
  });

  const editAnnotation = async (annotation: AnnotatedAyah) => {
    try {
      const ayah = await getAyah(quranDb, annotation.surahNumber, annotation.ayahNumber);
      if (!ayah) {
        showMessage('Could not open note', `Verse ${annotation.verseKey} was not found.`);
        return;
      }
      setEditorAyah({
        ...ayah,
        annotation,
        translationText: annotation.translationText,
      });
    } catch (error) {
      showMessage('Could not open note', error instanceof Error ? error.message : 'The verse could not be loaded.');
    }
  };

  const confirmDelete = (annotation: AnnotatedAyah) => {
    requestConfirmation({
      title: 'Delete note?',
      message: `This removes the note and any highlight from verse ${annotation.verseKey}. This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => deleteMutation.mutate(annotation),
    });
  };

  return (
    <FolioScreen scroll={false}>
      <FlatList
        contentContainerStyle={styles.list}
        data={annotations.data ?? []}
        initialNumToRender={10}
        keyExtractor={(annotation) => annotation.verseKey}
        ListEmptyComponent={annotations.isLoading ? (
          <LoadingFolio label="Gathering your reflections…" />
        ) : (
          <EmptyFolio
            body="Notes and whole-Ayah highlights you add in the reader will gather here."
            glyph="✦"
            title={search || effectiveTranslationId || color ? 'No matching reflections' : 'The margins are quiet'}
          />
        )}
        ListHeaderComponent={(
          <>
            <FolioHeader
              eyebrow="Your marginalia"
              subtitle="Search private reflections and return to the exact Ayah where each thought began."
              title="Notes & Highlights"
            />
            <View style={styles.searchBox}>
              <Ionicons color={colors.gold} name="search" size={20} />
              <FolioTextInput
                accessibilityLabel="Search notes and translation text"
                onChangeText={setSearch}
                placeholder="Search your reflections…"
                placeholderTextColor={colors.inkMuted}
                style={styles.searchInput}
                value={search}
              />
              {search ? <Pressable onPress={() => setSearch('')}><Ionicons color={colors.inkMuted} name="close-circle" size={20} /></Pressable> : null}
            </View>
            <Text style={styles.filterLabel}>TRANSLATION · {selectedTranslationName}</Text>
            <View style={styles.chipRow}>
              <FilterChip active={!effectiveTranslationId} label="All" onPress={() => setTranslationId(null)} />
              {translations.data?.map((translation) => (
                <FilterChip
                  active={effectiveTranslationId === translation.id}
                  key={translation.id}
                  label={translation.title}
                  onPress={() => setTranslationId(translation.id)}
                />
              ))}
            </View>
            <Text style={styles.filterLabel}>HIGHLIGHT</Text>
            <View style={styles.colorRow}>
              {highlightFilters.map((highlight) => (
                <Pressable
                  accessibilityLabel={highlight ? `${highlight} highlights` : 'All highlight colors'}
                  key={highlight ?? 'all'}
                  onPress={() => setColor(highlight)}
                  style={[
                    styles.colorChip,
                    highlight ? { backgroundColor: colors.highlight[highlight] } : null,
                    color === highlight ? styles.colorChipActive : null,
                  ]}
                >
                  {!highlight ? <Text style={styles.allColor}>ALL</Text> : null}
                </Pressable>
              ))}
            </View>
          </>
        )}
        renderItem={({ item }) => (
            <AnnotationCard
              annotation={item}
              deleting={deleteMutation.isPending && deleteMutation.variables?.verseKey === item.verseKey}
              fontScale={readingFontSize.scale}
            onDelete={confirmDelete}
            onEdit={(annotation) => void editAnnotation(annotation)}
          />
        )}
        showsVerticalScrollIndicator={false}
      />
      <AnnotationEditor
        ayah={editorAyah}
        key={editorAyah ? `${editorAyah.verseKey}-${editorAyah.annotation?.updatedAt ?? 0}` : 'closed'}
        onClose={() => setEditorAyah(null)}
        onSave={(note, highlight) => {
          if (editorAyah) saveMutation.mutate({ ayah: editorAyah, note, highlight });
        }}
        saving={saveMutation.isPending}
        visible={Boolean(editorAyah)}
      />
    </FolioScreen>
  );
}

interface AnnotationCardProps {
  annotation: AnnotatedAyah;
  deleting: boolean;
  fontScale?: number;
  onDelete: (annotation: AnnotatedAyah) => void;
  onEdit: (annotation: AnnotatedAyah) => void;
}

export function AnnotationCard({ annotation, deleting, fontScale = 1, onDelete, onEdit }: AnnotationCardProps) {
  return (
    <View
      style={[
        styles.noteCard,
        annotation.highlightColor ? { backgroundColor: colors.highlight[annotation.highlightColor] } : null,
      ]}
    >
      <Pressable
        accessibilityLabel={`Open verse ${annotation.verseKey}`}
        accessibilityRole="button"
        onPress={() => router.push({
          pathname: '/surah/[surahNumber]',
          params: { surahNumber: annotation.surahNumber, ayah: annotation.ayahNumber },
        })}
        style={({ pressed }) => [styles.noteContent, pressed ? styles.pressed : null]}
      >
        <View style={styles.noteTopline}>
          <Text style={styles.verseKey}>{annotation.verseKey}</Text>
          <Text numberOfLines={1} style={styles.translationTitle}>{annotation.translationTitle}</Text>
          <Ionicons color={colors.gold} name="arrow-forward" size={18} />
        </View>
        {annotation.noteText ? <Text style={[styles.noteText, { fontSize: 21 * fontScale, lineHeight: 26 * fontScale }]}>{annotation.noteText}</Text> : null}
        <Text numberOfLines={3} style={[styles.verseText, { fontSize: 16 * fontScale, lineHeight: 21 * fontScale }]}>{annotation.translationText}</Text>
        <Text style={styles.updated}>Updated {new Date(annotation.updatedAt).toLocaleDateString()}</Text>
      </Pressable>
      <View style={styles.noteActions}>
        <Pressable
          accessibilityLabel={`Edit note for verse ${annotation.verseKey}`}
          accessibilityRole="button"
          onPress={() => onEdit(annotation)}
          style={({ pressed }) => [styles.noteAction, pressed ? styles.actionPressed : null]}
        >
          <Ionicons color={colors.emerald} name="create-outline" size={18} />
          <Text style={styles.editActionLabel}>Edit</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={`Delete note for verse ${annotation.verseKey}`}
          accessibilityRole="button"
          disabled={deleting}
          onPress={() => onDelete(annotation)}
          style={({ pressed }) => [
            styles.noteAction,
            pressed ? styles.actionPressed : null,
            deleting ? styles.actionDisabled : null,
          ]}
        >
          <Ionicons color={colors.oxblood} name="trash-outline" size={18} />
          <Text style={styles.deleteActionLabel}>{deleting ? 'Deleting\u2026' : 'Delete'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active ? styles.chipActive : null]}>
      <Text numberOfLines={1} style={[styles.chipLabel, active ? styles.chipLabelActive : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  searchBox: { alignItems: 'center', backgroundColor: colors.paperLight, borderColor: colors.border, borderRadius: 3, borderWidth: 1, flexDirection: 'row', gap: 10, paddingHorizontal: 14 },
  searchInput: { color: colors.ink, flex: 1, fontFamily: fontFamilies.body, fontSize: 18, minHeight: 48 },
  filterLabel: { color: colors.inkMuted, fontFamily: fontFamilies.bodyBold, fontSize: 10, letterSpacing: 1.3, marginBottom: 7, marginTop: 16 },
  chipRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingRight: 20, paddingVertical: 2 },
  chip: { borderColor: colors.border, borderRadius: 2, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 8 },
  chipActive: { backgroundColor: colors.emerald, borderColor: colors.emerald },
  chipLabel: { color: colors.ink, fontFamily: fontFamilies.bodyBold, fontSize: 14 },
  chipLabelActive: { color: colors.paperLight },
  colorRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    overflow: 'visible',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  list: { paddingBottom: 90 },
  colorChip: { alignItems: 'center', borderColor: colors.border, borderRadius: 20, borderWidth: 2, height: 40, justifyContent: 'center', width: 40 },
  colorChipActive: { borderColor: colors.emerald, borderWidth: 4 },
  allColor: { color: colors.ink, fontFamily: fontFamilies.bodyBold, fontSize: 9 },
  noteCard: { backgroundColor: colors.paperLight, borderColor: colors.border, borderRadius: 3, borderWidth: 1, marginTop: 14, overflow: 'hidden' },
  noteContent: { padding: 16 },
  pressed: { opacity: 0.72 },
  noteTopline: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  verseKey: { color: colors.gold, fontFamily: fontFamilies.bodyBold, fontSize: 12, letterSpacing: 1.1 },
  translationTitle: { color: colors.inkMuted, flex: 1, fontFamily: fontFamilies.bodyBold, fontSize: 13 },
  noteText: { color: colors.ink, fontFamily: fontFamilies.displayItalic, fontSize: 21, lineHeight: 26, marginTop: 12 },
  verseText: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 16, lineHeight: 21, marginTop: 8 },
  updated: { color: colors.inkMuted, fontFamily: fontFamilies.bodyBold, fontSize: 9, letterSpacing: 1, marginTop: 12, textTransform: 'uppercase' },
  noteActions: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 8, paddingVertical: 5 },
  noteAction: { alignItems: 'center', flexDirection: 'row', gap: 6, minHeight: 44, paddingHorizontal: 12 },
  actionPressed: { opacity: 0.6 },
  actionDisabled: { opacity: 0.45 },
  editActionLabel: { color: colors.emerald, fontFamily: fontFamilies.bodyBold, fontSize: 14 },
  deleteActionLabel: { color: colors.oxblood, fontFamily: fontFamilies.bodyBold, fontSize: 14 },
});
