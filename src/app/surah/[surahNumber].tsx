import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as Speech from 'expo-speech';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyFolio } from '@/components/EmptyFolio';
import { LoadingFolio } from '@/components/LoadingFolio';
import { useUserDatabase } from '@/data/databases/UserDatabaseProvider';
import { listAnnotationsForSurah, saveAnnotation } from '@/features/annotations/data/annotationRepository';
import { AnnotationEditor } from '@/features/annotations/ui/AnnotationEditor';
import { getSurah, listAyahs } from '@/features/quran-reader/data/quranRepository';
import { DEFAULT_RECITER_ID, getReciter, isReciterId, RECITERS, type PlaybackMode, type ReciterId } from '@/features/recitation/domain/reciters';
import { getSetting, setSetting } from '@/features/settings/data/settingsRepository';
import { useSpeech } from '@/features/speech/application/SpeechProvider';
import { DEFAULT_VOICE_PROFILE_ID, getVoiceProfile, isVoiceProfileId, resolveVoiceForProfile } from '@/features/speech/domain/voiceProfiles';
import {
  getActiveTranslationId,
  getTranslation,
  listTranslationVerses,
} from '@/features/translations/data/translationRepository';
import { colors, fontFamilies } from '@/theme/tokens';
import type { HighlightColor, ReaderAyah } from '@/types/domain';

export default function SurahReaderScreen() {
  const { surahNumber: rawSurah, ayah: rawAyah } = useLocalSearchParams<{ surahNumber: string; ayah?: string }>();
  const surahNumber = Number(rawSurah);
  const targetAyah = Number(rawAyah ?? 0);
  const quranDb = useSQLiteContext();
  const userDb = useUserDatabase();
  const queryClient = useQueryClient();
  const speech = useSpeech();
  const listRef = useRef<FlatList<ReaderAyah>>(null);
  const [editorAyah, setEditorAyah] = useState<ReaderAyah | null>(null);
  const [selectedAyahNumber, setSelectedAyahNumber] = useState<number | null>(null);
  const [spokenAyahNumber, setSpokenAyahNumber] = useState<number | null>(null);
  const [playbackModeOverride, setPlaybackModeOverride] = useState<PlaybackMode | null>(null);
  const [reciterIdOverride, setReciterIdOverride] = useState<ReciterId | null>(null);
  const [voices, setVoices] = useState<Speech.Voice[]>([]);

  useEffect(() => {
    void Speech.getAvailableVoicesAsync().then(setVoices).catch(() => setVoices([]));
  }, []);

  const surah = useQuery({
    queryKey: ['surah', surahNumber],
    queryFn: () => getSurah(quranDb, surahNumber),
    enabled: Number.isInteger(surahNumber) && surahNumber >= 1 && surahNumber <= 114,
    staleTime: Infinity,
  });
  const arabicAyahs = useQuery({
    queryKey: ['ayahs', surahNumber],
    queryFn: () => listAyahs(quranDb, surahNumber),
    enabled: Boolean(surah.data),
    staleTime: Infinity,
  });
  const activeTranslation = useQuery({
    queryKey: ['active-translation'],
    queryFn: async () => {
      const id = await getActiveTranslationId(userDb);
      return id ? getTranslation(userDb, id) : null;
    },
  });
  const translatedAyahs = useQuery({
    queryKey: ['translation-verses', activeTranslation.data?.id, surahNumber],
    queryFn: () => listTranslationVerses(userDb, activeTranslation.data!.id, surahNumber),
    enabled: Boolean(activeTranslation.data?.id),
  });
  const speechSettings = useQuery({
    queryKey: ['speech-settings', activeTranslation.data?.language],
    queryFn: async () => ({
      profile: await getSetting(userDb, 'tts_voice_profile'),
    }),
    enabled: Boolean(activeTranslation.data?.language),
  });
  const playbackSettings = useQuery({
    queryKey: ['recitation-settings'],
    queryFn: async () => ({ mode: await getSetting(userDb, 'playback_mode'), reciter: await getSetting(userDb, 'reciter_id') }),
  });
  const storedMode = playbackSettings.data?.mode;
  const playbackMode: PlaybackMode = playbackModeOverride
    ?? (storedMode === 'recitation' || ((storedMode === 'translation' || storedMode === 'both') && activeTranslation.data) ? storedMode : 'recitation');
  const storedReciter = playbackSettings.data?.reciter ?? null;
  const reciterId = reciterIdOverride ?? (isReciterId(storedReciter) ? storedReciter : DEFAULT_RECITER_ID);
  const voiceProfileId = isVoiceProfileId(speechSettings.data?.profile) ? speechSettings.data.profile : DEFAULT_VOICE_PROFILE_ID;
  const voiceProfile = getVoiceProfile(voiceProfileId);
  const translationVoice = activeTranslation.data
    ? resolveVoiceForProfile(voices, activeTranslation.data.language, voiceProfileId)
    : undefined;
  const annotations = useQuery({
    queryKey: ['annotations', surahNumber],
    queryFn: () => listAnnotationsForSurah(userDb, surahNumber),
    enabled: Number.isInteger(surahNumber) && surahNumber >= 1 && surahNumber <= 114,
  });

  const readerAyahs = useMemo<ReaderAyah[]>(() => {
    const translations = new Map(translatedAyahs.data?.map((verse) => [verse.key, verse.text]));
    const notes = new Map(annotations.data?.map((annotation) => [`${annotation.surahNumber}:${annotation.ayahNumber}`, annotation]));
    return (arabicAyahs.data ?? []).map((ayah) => ({
      ...ayah,
      translationText: translations.get(ayah.verseKey) ?? null,
      annotation: notes.get(ayah.verseKey) ?? null,
    }));
  }, [annotations.data, arabicAyahs.data, translatedAyahs.data]);

  useEffect(() => {
    if (targetAyah > 0 && readerAyahs.length >= targetAyah) {
      const timeout = setTimeout(() => listRef.current?.scrollToIndex({ index: targetAyah - 1, animated: true }), 250);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [readerAyahs.length, targetAyah]);

  const resetSpeech = speech.reset;
  useEffect(() => () => {
    void resetSpeech();
  }, [resetSpeech]);

  const saveMutation = useMutation({
    mutationFn: ({ note, highlight }: { note: string | null; highlight: HighlightColor | null }) =>
      saveAnnotation(userDb, {
        translationId: activeTranslation.data!.id,
        surahNumber,
        ayahNumber: editorAyah!.ayahNumber,
        noteText: note,
        highlightColor: highlight,
      }),
    onSuccess: async () => {
      setEditorAyah(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['annotations', surahNumber] }),
        queryClient.invalidateQueries({ queryKey: ['annotated-ayahs'] }),
      ]);
    },
  });

  if (!Number.isInteger(surahNumber) || surahNumber < 1 || surahNumber > 114) {
    return <EmptyFolio body="This Surah number is outside the canonical Quran." glyph="؟" title="Surah not found" />;
  }
  if (surah.isLoading || arabicAyahs.isLoading) return <LoadingFolio label="Setting the Ayahs…" />;
  if (!surah.data) return <EmptyFolio body="The requested Surah could not be found." glyph="؟" title="Surah not found" />;

  const isReading = speech.status === 'speaking';
  const [speechSurahPart, speechAyahPart] = speech.currentVerseKey?.split(':') ?? [];
  const speechAyahNumber = Number(speechAyahPart);
  const speechCursor = Number(speechSurahPart) === surahNumber && Number.isInteger(speechAyahNumber)
    ? speechAyahNumber
    : null;
  const activeSpeechCursor = speech.status === 'speaking' || speech.status === 'paused' ? speechCursor : null;
  const playbackStartAyah = activeSpeechCursor
    ?? spokenAyahNumber
    ?? selectedAyahNumber
    ?? speechCursor
    ?? (targetAyah > 0 ? targetAyah : null)
    ?? 1;
  const selectAyah = (ayahNumber: number) => {
    if (speech.status === 'speaking' || speech.status === 'paused') void speech.stop();
    setSelectedAyahNumber(ayahNumber);
    setSpokenAyahNumber(null);
  };
  const startSurahPlayback = () => {
    const startIndex = readerAyahs.findIndex((verse) => verse.ayahNumber >= playbackStartAyah);
    if (startIndex < 0) return;
    setSelectedAyahNumber(null);
    speech.play(
      readerAyahs.slice(startIndex).map((verse) => ({ key: verse.verseKey, text: verse.translationText ?? '' })),
      playbackMode,
      reciterId,
      activeTranslation.data?.language,
      translationVoice?.identifier,
      voiceProfile.rate,
      voiceProfile.pitch,
    );
  };

  const chooseMode = (mode: PlaybackMode) => {
    if (mode !== 'recitation' && !activeTranslation.data) return;
    if (speech.status !== 'idle') void speech.stop();
    setPlaybackModeOverride(mode);
    void setSetting(userDb, 'playback_mode', mode);
  };

  const chooseReciter = (id: ReciterId) => {
    if (speech.status !== 'idle') void speech.stop();
    setReciterIdOverride(id);
    void setSetting(userDb, 'reciter_id', id);
  };

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons color={colors.paperLight} name="arrow-back" size={22} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerEyebrow}>SURAH {surahNumber} · {surah.data.ayahCount} AYAHS</Text>
          <Text style={styles.headerTitle}>{surah.data.nameTransliterated}</Text>
        </View>
        <Text style={styles.headerArabic}>{surah.data.nameArabic}</Text>
      </View>

      <View style={styles.playbackOptions}>
        <View style={styles.chipRow}>
          {(['recitation', 'translation', 'both'] as const).map((mode) => {
            const disabled = mode !== 'recitation' && !activeTranslation.data;
            return (
              <Pressable accessibilityRole="button" disabled={disabled} key={mode} onPress={() => chooseMode(mode)} style={[styles.modeChip, playbackMode === mode ? styles.modeChipActive : null, disabled ? styles.modeChipDisabled : null]}>
                <Text style={[styles.modeChipText, playbackMode === mode ? styles.modeChipTextActive : null]}>{mode === 'recitation' ? 'Qur’an' : mode === 'translation' ? 'Translation' : 'Both'}</Text>
              </Pressable>
            );
          })}
        </View>
        {playbackMode !== 'translation' ? (
          <View style={styles.chipRow}>
            {RECITERS.map((reciter) => (
              <Pressable accessibilityRole="button" key={reciter.id} onPress={() => chooseReciter(reciter.id)} style={[styles.reciterChip, reciterId === reciter.id ? styles.reciterChipActive : null]}>
                <Text style={[styles.reciterChipText, reciterId === reciter.id ? styles.reciterChipTextActive : null]}>{reciter.id === 'husary' ? 'Al-Husary' : 'Abdul Basit'}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {playbackMode === 'recitation' || activeTranslation.data ? (
        <View style={styles.playbackBar}>
          <View style={styles.playbackCopy}>
            <Text style={styles.playbackLabel}>{playbackMode === 'translation' ? activeTranslation.data?.title : getReciter(reciterId).name}</Text>
            <Text style={styles.playbackState}>
              {speech.status === 'speaking' || speech.status === 'paused'
                ? `${speech.phase === 'recitation' ? 'Reciting' : 'Reading'} ${speech.currentVerseKey}`
                : speech.status === 'loading' ? `Loading ${speech.currentVerseKey}`
                : speech.status === 'error' ? speech.error
                : `Start at ${surahNumber}:${playbackStartAyah}`}
            </Text>
          </View>
          {speech.status === 'paused' ? (
            <Pressable accessibilityLabel="Resume" onPress={() => void speech.resume()} style={styles.playButton}>
              <Ionicons color={colors.emerald} name="play" size={21} />
            </Pressable>
          ) : isReading ? (
            <Pressable accessibilityLabel="Pause" onPress={() => void speech.pause()} style={styles.playButton}>
              <Ionicons color={colors.emerald} name="pause" size={21} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityLabel="Read this Surah aloud"
              onPress={startSurahPlayback}
              style={styles.playButton}
            >
              <Ionicons color={colors.emerald} name="play" size={21} />
            </Pressable>
          )}
          <Pressable accessibilityLabel="Stop speech" onPress={() => void speech.stop()} style={styles.playButton}>
            <Ionicons color={colors.oxblood} name="stop" size={20} />
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => router.push('/translations')} style={styles.importPrompt}>
          <Ionicons color={colors.gold} name="document-text-outline" size={20} />
          <Text style={styles.importPromptText}>Import a translation to add notes, highlights, and read aloud.</Text>
          <Ionicons color={colors.gold} name="chevron-forward" size={18} />
        </Pressable>
      )}

      <FlatList
        contentContainerStyle={styles.list}
        data={readerAyahs}
        initialNumToRender={10}
        keyExtractor={(item) => item.verseKey}
        onScrollToIndexFailed={({ index }) => setTimeout(() => listRef.current?.scrollToIndex({ index, animated: true }), 400)}
        ref={listRef}
        renderItem={({ item }) => {
          const highlighted = item.annotation?.highlightColor;
          const speaking = (speech.status === 'speaking' || speech.status === 'paused')
            && speech.currentVerseKey === item.verseKey;
          const selected = item.ayahNumber === playbackStartAyah;
          return (
            <Pressable
              accessibilityLabel={`Select verse ${item.verseKey} for playback`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => selectAyah(item.ayahNumber)}
              style={({ pressed }) => [
                styles.ayahCard,
                highlighted ? { backgroundColor: colors.highlight[highlighted] } : null,
                selected ? styles.selectedCard : null,
                speaking ? styles.speakingCard : null,
                pressed ? styles.ayahCardPressed : null,
              ]}
            >
              <View style={styles.ayahTopline}>
                <Text style={styles.verseKey}>{item.verseKey}</Text>
                <View style={styles.ayahActions}>
                  <Pressable
                    accessibilityLabel={`Play verse ${item.verseKey}`}
                    onPress={(event) => {
                      event.stopPropagation();
                      setSpokenAyahNumber(item.ayahNumber);
                      speech.play(
                        [{ key: item.verseKey, text: item.translationText ?? '' }],
                        playbackMode,
                        reciterId,
                        activeTranslation.data?.language,
                        translationVoice?.identifier,
                        voiceProfile.rate,
                        voiceProfile.pitch,
                      );
                    }}
                    style={styles.iconButton}
                  >
                    <Ionicons color={colors.emerald} name="volume-medium-outline" size={20} />
                  </Pressable>
                  {activeTranslation.data ? (
                    <Pressable
                      accessibilityLabel={`Annotate verse ${item.verseKey}`}
                      onPress={(event) => {
                        event.stopPropagation();
                        setEditorAyah(item);
                      }}
                      style={styles.iconButton}
                    >
                      <Ionicons
                        color={item.annotation ? colors.gold : colors.inkMuted}
                        name={item.annotation ? 'bookmark' : 'bookmark-outline'}
                        size={19}
                      />
                    </Pressable>
                  ) : null}
                </View>
              </View>
              <Text selectable style={styles.ayahArabic}>{item.textUthmani} <Text style={styles.ayahNumber}>﴿{item.ayahNumber}﴾</Text></Text>
              {item.translationText ? <View style={styles.divider} /> : null}
              {item.translationText ? <Text selectable style={styles.translation}>{item.translationText}</Text> : null}
              {item.annotation?.noteText ? (
                <View style={styles.notePreview}>
                  <Text style={styles.noteLabel}>REFLECTION</Text>
                  <Text numberOfLines={3} style={styles.noteText}>{item.annotation.noteText}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        }}
        showsVerticalScrollIndicator={false}
      />
      <AnnotationEditor
        ayah={editorAyah}
        key={editorAyah?.verseKey ?? 'closed'}
        onClose={() => setEditorAyah(null)}
        onSave={(note, highlight) => saveMutation.mutate({ note, highlight })}
        saving={saveMutation.isPending}
        visible={Boolean(editorAyah)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.paper, flex: 1 },
  header: { alignItems: 'center', backgroundColor: colors.emerald, flexDirection: 'row', gap: 12, minHeight: 78, paddingHorizontal: 16, paddingVertical: 10 },
  headerButton: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  headerCopy: { flex: 1 },
  headerEyebrow: { color: colors.goldLight, fontFamily: fontFamilies.bodyBold, fontSize: 10, letterSpacing: 1.3 },
  headerTitle: { color: colors.paperLight, fontFamily: fontFamilies.display, fontSize: 25 },
  headerArabic: { color: colors.paperLight, fontFamily: fontFamilies.arabicBold, fontSize: 23 },
  playbackBar: { alignItems: 'center', backgroundColor: colors.paperLight, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', gap: 8, paddingHorizontal: 18, paddingVertical: 10 },
  playbackOptions: { backgroundColor: colors.paperLight, borderBottomColor: colors.border, borderBottomWidth: 1, gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  chipRow: { flexDirection: 'row', gap: 8 },
  modeChip: { borderColor: colors.border, borderRadius: 18, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 7 },
  modeChipActive: { backgroundColor: colors.emerald, borderColor: colors.emerald },
  modeChipDisabled: { opacity: 0.38 },
  modeChipText: { color: colors.ink, fontFamily: fontFamilies.bodyBold, fontSize: 13 },
  modeChipTextActive: { color: colors.paperLight },
  reciterChip: { borderBottomColor: 'transparent', borderBottomWidth: 2, paddingHorizontal: 4, paddingVertical: 4 },
  reciterChipActive: { borderBottomColor: colors.gold },
  reciterChipText: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 13 },
  reciterChipTextActive: { color: colors.ink, fontFamily: fontFamilies.bodyBold },
  playbackCopy: { flex: 1 },
  playbackLabel: { color: colors.ink, fontFamily: fontFamilies.bodyBold, fontSize: 16 },
  playbackState: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 14 },
  playButton: { alignItems: 'center', borderColor: colors.border, borderRadius: 22, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 },
  importPrompt: { alignItems: 'center', backgroundColor: colors.paperLight, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', gap: 10, padding: 14 },
  importPromptText: { color: colors.ink, flex: 1, fontFamily: fontFamilies.body, fontSize: 16 },
  list: { padding: 16, paddingBottom: 60 },
  ayahCard: { backgroundColor: colors.paperLight, borderColor: colors.border, borderRadius: 3, borderWidth: 1, marginBottom: 14, padding: 18 },
  ayahCardPressed: { opacity: 0.82 },
  selectedCard: { borderColor: colors.gold, borderWidth: 2 },
  speakingCard: { borderColor: colors.gold, borderWidth: 2 },
  ayahTopline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  verseKey: { color: colors.gold, fontFamily: fontFamilies.bodyBold, fontSize: 12, letterSpacing: 1.2 },
  ayahActions: { flexDirection: 'row', gap: 6 },
  iconButton: { alignItems: 'center', height: 38, justifyContent: 'center', width: 38 },
  ayahArabic: { color: colors.ink, fontFamily: fontFamilies.arabic, fontSize: 29, lineHeight: 52, marginTop: 8, textAlign: 'right', writingDirection: 'rtl' },
  ayahNumber: { color: colors.gold, fontFamily: fontFamilies.arabic, fontSize: 21 },
  divider: { backgroundColor: colors.gold, height: 1, marginVertical: 14, opacity: 0.45, width: 32 },
  translation: { color: colors.ink, fontFamily: fontFamilies.body, fontSize: 19, lineHeight: 27 },
  notePreview: { borderLeftColor: colors.gold, borderLeftWidth: 2, marginTop: 16, paddingLeft: 12 },
  noteLabel: { color: colors.gold, fontFamily: fontFamilies.bodyBold, fontSize: 10, letterSpacing: 1.2 },
  noteText: { color: colors.inkMuted, fontFamily: fontFamilies.displayItalic, fontSize: 17, lineHeight: 22 },
});
