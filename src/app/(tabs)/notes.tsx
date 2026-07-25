import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyFolio } from '@/components/EmptyFolio';
import { FolioScreen } from '@/components/FolioScreen';
import { LoadingFolio } from '@/components/LoadingFolio';
import { useUserDatabase } from '@/data/databases/UserDatabaseProvider';
import { listAnnotatedAyahs } from '@/features/annotations/data/annotationRepository';
import { listTranslations } from '@/features/translations/data/translationRepository';
import { FolioTextInput } from '@/platform/ui/FolioTextInput';
import { colors, fontFamilies } from '@/theme/tokens';
import type { AnnotatedAyah, HighlightColor } from '@/types/domain';

const highlightFilters: (HighlightColor | null)[] = [null, 'amber', 'sage', 'sky', 'rose'];

export default function NotesScreen() {
  const db = useUserDatabase();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [translationId, setTranslationId] = useState<string | null>(null);
  const [color, setColor] = useState<HighlightColor | null>(null);
  const translations = useQuery({ queryKey: ['translations'], queryFn: () => listTranslations(db) });
  const annotations = useQuery({
    queryKey: ['annotated-ayahs', deferredSearch, translationId, color],
    queryFn: () => listAnnotatedAyahs(db, deferredSearch, translationId, color),
  });
  const selectedTranslationName = useMemo(
    () => translations.data?.find((item) => item.id === translationId)?.title ?? 'All translations',
    [translationId, translations.data],
  );

  return (
    <FolioScreen
      scroll={false}
      eyebrow="Your marginalia"
      subtitle="Search private reflections and return to the exact Ayah where each thought began."
      title="Notes & Highlights"
    >
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
        <FilterChip active={!translationId} label="All" onPress={() => setTranslationId(null)} />
        {translations.data?.map((translation) => (
          <FilterChip
            active={translationId === translation.id}
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

      {annotations.isLoading ? (
        <LoadingFolio label="Gathering your reflections…" />
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={annotations.data ?? []}
          initialNumToRender={10}
          keyExtractor={(annotation) => `${annotation.translationId}-${annotation.verseKey}`}
          ListEmptyComponent={
            <EmptyFolio
              body="Notes and whole-Ayah highlights you add in the reader will gather here."
              glyph="✦"
              title={search || translationId || color ? 'No matching reflections' : 'The margins are quiet'}
            />
          }
          renderItem={({ item }) => <AnnotationCard annotation={item} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </FolioScreen>
  );
}

function AnnotationCard({ annotation }: { annotation: AnnotatedAyah }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({
        pathname: '/surah/[surahNumber]',
        params: { surahNumber: annotation.surahNumber, ayah: annotation.ayahNumber },
      })}
      style={({ pressed }) => [
        styles.noteCard,
        annotation.highlightColor ? { backgroundColor: colors.highlight[annotation.highlightColor] } : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.noteTopline}>
        <Text style={styles.verseKey}>{annotation.verseKey}</Text>
        <Text numberOfLines={1} style={styles.translationTitle}>{annotation.translationTitle}</Text>
        <Ionicons color={colors.gold} name="arrow-forward" size={18} />
      </View>
      {annotation.noteText ? <Text style={styles.noteText}>{annotation.noteText}</Text> : null}
      <Text numberOfLines={3} style={styles.verseText}>{annotation.translationText}</Text>
      <Text style={styles.updated}>Updated {new Date(annotation.updatedAt).toLocaleDateString()}</Text>
    </Pressable>
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
  colorRow: { flexDirection: 'row', gap: 11 },
  list: { paddingBottom: 90 },
  colorChip: { alignItems: 'center', borderColor: colors.border, borderRadius: 18, borderWidth: 2, height: 36, justifyContent: 'center', width: 36 },
  colorChipActive: { borderColor: colors.emerald, transform: [{ scale: 1.1 }] },
  allColor: { color: colors.ink, fontFamily: fontFamilies.bodyBold, fontSize: 9 },
  noteCard: { backgroundColor: colors.paperLight, borderColor: colors.border, borderRadius: 3, borderWidth: 1, marginTop: 14, padding: 16 },
  pressed: { opacity: 0.72 },
  noteTopline: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  verseKey: { color: colors.gold, fontFamily: fontFamilies.bodyBold, fontSize: 12, letterSpacing: 1.1 },
  translationTitle: { color: colors.inkMuted, flex: 1, fontFamily: fontFamilies.bodyBold, fontSize: 13 },
  noteText: { color: colors.ink, fontFamily: fontFamilies.displayItalic, fontSize: 21, lineHeight: 26, marginTop: 12 },
  verseText: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 16, lineHeight: 21, marginTop: 8 },
  updated: { color: colors.inkMuted, fontFamily: fontFamilies.bodyBold, fontSize: 9, letterSpacing: 1, marginTop: 12, textTransform: 'uppercase' },
});
