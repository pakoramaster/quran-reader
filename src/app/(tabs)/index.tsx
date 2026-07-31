import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { FolioHeader, FolioScreen } from '@/components/FolioScreen';
import { LoadingFolio } from '@/components/LoadingFolio';
import { useUserDatabase } from '@/data/databases/UserDatabaseProvider';
import { listSurahs } from '@/features/quran-reader/data/quranRepository';
import { getActiveTranslationId, getTranslation } from '@/features/translations/data/translationRepository';
import { colors, fontFamilies, spacing } from '@/theme/tokens';
import type { Surah } from '@/types/domain';

function SurahRow({ surah }: { surah: Surah }) {
  return (
    <Pressable
      accessibilityLabel={`${surah.nameTransliterated}, ${surah.ayahCount} ayahs`}
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/surah/[surahNumber]', params: { surahNumber: surah.number } })}
      style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
    >
      <View style={styles.numberMedallion}>
        <Text style={styles.number}>{surah.number}</Text>
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.transliterated}>{surah.nameTransliterated}</Text>
        <Text style={styles.count}>{surah.ayahCount} AYAH{surah.ayahCount === 1 ? '' : 'S'}</Text>
      </View>
      <Text style={styles.arabic}>{surah.nameArabic}</Text>
      <Ionicons color={colors.gold} name="chevron-forward" size={18} />
    </Pressable>
  );
}

export default function QuranIndexScreen() {
  const quranDb = useSQLiteContext();
  const userDb = useUserDatabase();
  const surahs = useQuery({ queryKey: ['surahs'], queryFn: () => listSurahs(quranDb), staleTime: Infinity });
  const activeTranslation = useQuery({
    queryKey: ['active-translation'],
    queryFn: async () => {
      const id = await getActiveTranslationId(userDb);
      return id ? getTranslation(userDb, id) : null;
    },
  });

  return (
    <FolioScreen
      contentStyle={styles.screen}
      scroll={false}
    >
      <FlatList
        contentContainerStyle={styles.list}
        data={surahs.data ?? []}
        initialNumToRender={14}
        keyExtractor={(item) => String(item.number)}
        ListEmptyComponent={surahs.isLoading ? <LoadingFolio label="Opening the Surahs…" /> : null}
        ListHeaderComponent={(
          <>
            <FolioHeader
              eyebrow="Private · Offline · Verbatim"
              subtitle="The verified Arabic text remains untouched. Your translations and reflections stay on this device."
              title="Quran Folio"
            />
            <View style={styles.activeStrip}>
              <Ionicons color={colors.gold} name="language-outline" size={19} />
              <View style={styles.activeCopy}>
                <Text style={styles.activeLabel}>ACTIVE TRANSLATION</Text>
                <Text style={styles.activeValue}>
                  {activeTranslation.data?.title ?? 'No translation imported yet'}
                </Text>
              </View>
              <Pressable accessibilityRole="button" onPress={() => router.push('/translations')}>
                <Text style={styles.manage}>MANAGE</Text>
              </Pressable>
            </View>
          </>
        )}
        renderItem={({ item }) => <SurahRow surah={item} />}
        showsVerticalScrollIndicator={false}
      />
    </FolioScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0 },
  activeStrip: {
    alignItems: 'center',
    backgroundColor: colors.emerald,
    borderRadius: 3,
    flexDirection: 'row',
    gap: 12,
    marginBottom: spacing.md,
    padding: 14,
  },
  activeCopy: { flex: 1 },
  activeLabel: { color: colors.goldLight, fontFamily: fontFamilies.bodyBold, fontSize: 10, letterSpacing: 1.5 },
  activeValue: { color: colors.paperLight, fontFamily: fontFamilies.body, fontSize: 17 },
  manage: { color: colors.goldLight, fontFamily: fontFamilies.bodyBold, fontSize: 12, letterSpacing: 1 },
  list: { paddingBottom: 90 },
  row: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 13,
    minHeight: 76,
    paddingVertical: 10,
  },
  rowPressed: { backgroundColor: colors.paperDeep, opacity: 0.8 },
  numberMedallion: {
    alignItems: 'center',
    borderColor: colors.gold,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    transform: [{ rotate: '45deg' }],
    width: 44,
  },
  number: { color: colors.emerald, fontFamily: fontFamilies.bodyBold, fontSize: 15, transform: [{ rotate: '-45deg' }] },
  rowCopy: { flex: 1 },
  transliterated: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 22 },
  count: { color: colors.inkMuted, fontFamily: fontFamilies.bodyBold, fontSize: 10, letterSpacing: 1.2 },
  arabic: {
    color: colors.emerald,
    fontFamily: fontFamilies.arabicBold,
    fontSize: 22,
    flexShrink: 1,
    minWidth: 0,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
