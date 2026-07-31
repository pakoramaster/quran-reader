import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Speech from 'expo-speech';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FolioScreen } from '@/components/FolioScreen';
import { useUserDatabase } from '@/data/databases/UserDatabaseProvider';
import { listAyahsInRange, listSurahs } from '@/features/quran-reader/data/quranRepository';
import { DEFAULT_RECITER_ID, getReciter, isReciterId, RECITERS, type ReciterId } from '@/features/recitation/domain/reciters';
import { CompactVolumeControl } from '@/features/recitation/ui/CompactVolumeControl';
import { getSetting, setSetting } from '@/features/settings/data/settingsRepository';
import { useSpeech } from '@/features/speech/application/SpeechProvider';
import {
  DEFAULT_VOICE_PROFILE_ID,
  getVoiceProfile,
  isVoiceProfileId,
  resolveVoiceForProfile,
} from '@/features/speech/domain/voiceProfiles';
import { listTranslations, listTranslationVersesInRange } from '@/features/translations/data/translationRepository';
import { colors, fontFamilies, spacing } from '@/theme/tokens';
import type { VerseKey } from '@/types/domain';

const keys = {
  reciter: 'recitation_reciter_id',
  translation: 'recitation_translation_id',
  start: 'recitation_start_surah',
  end: 'recitation_end_surah',
  rangeRepeat: 'recitation_range_repeat',
  ayahRepeat: 'recitation_ayah_repeat',
  volume: 'recitation_volume',
} as const;

function bounded(value: string | null, fallback: number, min: number, max: number) {
  if (value === null || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

interface PlaybackRow {
  key: VerseKey;
  surahNumber: number;
  ayahNumber: number;
  arabic: string;
  translation: string | null;
}

export default function RecitationScreen() {
  const quranDb = useSQLiteContext();
  const userDb = useUserDatabase();
  const speech = useSpeech();
  const verseListRef = useRef<FlatList<PlaybackRow>>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rangePicker, setRangePicker] = useState<'start' | 'end' | null>(null);
  const [selectedVerseKey, setSelectedVerseKey] = useState<VerseKey | null>(null);
  const [followingPlayback, setFollowingPlayback] = useState(true);
  const [voices, setVoices] = useState<Speech.Voice[]>([]);
  const [reciterOverride, setReciterOverride] = useState<ReciterId | null | undefined>();
  const [translationOverride, setTranslationOverride] = useState<string | null | undefined>();
  const [startOverride, setStartOverride] = useState<number>();
  const [endOverride, setEndOverride] = useState<number>();
  const [rangeRepeatOverride, setRangeRepeatOverride] = useState<number>();
  const [ayahRepeatOverride, setAyahRepeatOverride] = useState<number>();
  const [volumeOverride, setVolumeOverride] = useState<number>();

  const surahs = useQuery({ queryKey: ['surahs'], queryFn: () => listSurahs(quranDb), staleTime: Infinity });
  const translations = useQuery({ queryKey: ['translations'], queryFn: () => listTranslations(userDb) });
  const stored = useQuery({
    queryKey: ['recitation-player-settings'],
    queryFn: async () => ({
      reciter: await getSetting(userDb, keys.reciter),
      translation: await getSetting(userDb, keys.translation),
      start: await getSetting(userDb, keys.start),
      end: await getSetting(userDb, keys.end),
      rangeRepeat: await getSetting(userDb, keys.rangeRepeat),
      ayahRepeat: await getSetting(userDb, keys.ayahRepeat),
      volume: await getSetting(userDb, keys.volume),
      voiceProfile: await getSetting(userDb, 'tts_voice_profile'),
    }),
  });

  useEffect(() => {
    void Speech.getAvailableVoicesAsync().then(setVoices).catch(() => setVoices([]));
  }, []);

  const storedReciter = stored.data?.reciter ?? null;
  const reciterId: ReciterId | null = reciterOverride !== undefined
    ? reciterOverride
    : isReciterId(storedReciter) ? storedReciter : null;
  const requestedTranslationId = translationOverride !== undefined ? translationOverride : stored.data?.translation ?? null;
  const translation = translations.data?.find((item) => item.id === requestedTranslationId) ?? null;
  const startSurah = startOverride ?? bounded(stored.data?.start ?? null, 1, 1, 114);
  const endSurah = Math.max(startSurah, endOverride ?? bounded(stored.data?.end ?? null, startSurah, 1, 114));
  const rangeRepeat = rangeRepeatOverride ?? bounded(stored.data?.rangeRepeat ?? null, 1, 1, 20);
  const ayahRepeat = ayahRepeatOverride ?? bounded(stored.data?.ayahRepeat ?? null, 1, 1, 20);
  const volume = volumeOverride ?? bounded(stored.data?.volume ?? null, 0.8, 0, 1);
  const voiceProfileId = isVoiceProfileId(stored.data?.voiceProfile) ? stored.data.voiceProfile : DEFAULT_VOICE_PROFILE_ID;
  const voiceProfile = getVoiceProfile(voiceProfileId);
  const voice = translation ? resolveVoiceForProfile(voices, translation.language, voiceProfileId) : undefined;
  const startName = surahs.data?.[startSurah - 1]?.nameTransliterated ?? `Surah ${startSurah}`;
  const endName = surahs.data?.[endSurah - 1]?.nameTransliterated ?? `Surah ${endSurah}`;
  const hasSource = Boolean(reciterId || translation);
  const isActive = speech.status === 'speaking' || speech.status === 'loading';
  const rangeAyahs = useQuery({
    queryKey: ['recitation-range-ayahs', startSurah, endSurah],
    queryFn: () => listAyahsInRange(quranDb, startSurah, endSurah),
    staleTime: Infinity,
  });
  const rangeTranslation = useQuery({
    queryKey: ['recitation-range-translation', translation?.id, startSurah, endSurah],
    queryFn: () => listTranslationVersesInRange(userDb, translation!.id, startSurah, endSurah),
    enabled: Boolean(translation),
  });
  const playbackRows = useMemo<PlaybackRow[]>(() => {
    const translatedByKey = new Map(rangeTranslation.data?.map((verse) => [verse.key, verse.text]));
    return (rangeAyahs.data ?? []).map((ayah) => ({
      key: ayah.verseKey,
      surahNumber: ayah.surahNumber,
      ayahNumber: ayah.ayahNumber,
      arabic: ayah.textUthmani,
      translation: translatedByKey.get(ayah.verseKey) ?? null,
    }));
  }, [rangeAyahs.data, rangeTranslation.data]);
  const selectedIndex = Math.max(0, playbackRows.findIndex((verse) => verse.key === selectedVerseKey));
  const currentIndex = playbackRows.findIndex((verse) => verse.key === speech.currentVerseKey);
  const versesLoading = rangeAyahs.isLoading || (Boolean(translation) && rangeTranslation.isLoading);

  useEffect(() => {
    if (!followingPlayback || currentIndex < 0 || speech.status === 'idle') return;
    verseListRef.current?.scrollToIndex({ animated: true, index: currentIndex, viewPosition: 0.42 });
  }, [currentIndex, followingPlayback, speech.status]);

  const stopForChange = () => { if (speech.status !== 'idle') void speech.stop(); };
  const persistNumber = (key: string, value: number) => { void setSetting(userDb, key, String(value)); };
  const changeVolume = (value: number) => {
    const next = Math.max(0, Math.min(1, value));
    setVolumeOverride(next);
    speech.setVolume(next);
    persistNumber(keys.volume, next);
  };
  const selectReciter = (value: ReciterId | null) => {
    stopForChange();
    setReciterOverride(value);
    void setSetting(userDb, keys.reciter, value ?? 'none');
  };
  const selectTranslation = (value: string | null) => {
    stopForChange();
    setTranslationOverride(value);
    void setSetting(userDb, keys.translation, value ?? 'none');
  };
  const changeStart = (value: number) => {
    const next = Math.max(1, Math.min(114, value));
    stopForChange();
    setStartOverride(next);
    persistNumber(keys.start, next);
    if (next > endSurah) { setEndOverride(next); persistNumber(keys.end, next); }
  };
  const changeEnd = (value: number) => {
    const next = Math.max(startSurah, Math.min(114, value));
    stopForChange();
    setEndOverride(next);
    persistNumber(keys.end, next);
  };

  const beginPlayback = (startAt = selectedIndex) => {
    if (!hasSource || !playbackRows.length || versesLoading) return;
    const mode = reciterId && translation ? 'both' : reciterId ? 'recitation' : 'translation';
    speech.play(
      playbackRows.map((ayah) => ({ key: ayah.key, text: ayah.translation ?? '' })),
      mode,
      reciterId ?? DEFAULT_RECITER_ID,
      translation?.language,
      voice?.identifier,
      voiceProfile.rate,
      voiceProfile.pitch,
      volume,
      { range: rangeRepeat, ayah: ayahRepeat, startAt },
    );
  };

  const selectPlayhead = (index: number) => {
    const verse = playbackRows[index];
    if (!verse) return;
    setSelectedVerseKey(verse.key);
    setFollowingPlayback(true);
    verseListRef.current?.scrollToIndex({ animated: true, index, viewPosition: 0.42 });
    if (speech.status !== 'idle') beginPlayback(index);
  };

  const sourceLabel = reciterId && translation
    ? `${getReciter(reciterId).name} · ${translation.title}`
    : reciterId ? getReciter(reciterId).name
    : translation?.title ?? 'Choose a reciter or translation';

  return (
    <>
      <FolioScreen
        eyebrow="Listen and repeat"
        contentStyle={styles.screen}
        scroll={false}
        subtitle="Play recitation, translation, or both across a chosen Surah range."
        title="Recitation"
      >
        <View style={styles.verseListShell}>
          <FlatList
            contentContainerStyle={styles.verseList}
            data={playbackRows}
            keyExtractor={(item) => item.key}
            ListHeaderComponent={(
              <>
                <View style={styles.playerCard}>
          <View style={styles.playerTopline}>
            <View style={styles.playerCopy}>
              <Text style={styles.sourceLabel} numberOfLines={2}>{sourceLabel}</Text>
              <Text style={styles.rangeLabel}>Surah {startSurah}–{endSurah} · {rangeRepeat}× range · {ayahRepeat}× each Ayah</Text>
            </View>
            <Ionicons color={hasSource ? colors.gold : colors.inkMuted} name="headset" size={30} />
          </View>

          {!hasSource ? (
            <Pressable onPress={() => setSettingsOpen(true)} style={styles.emptyPrompt}>
              <Ionicons color={colors.gold} name="information-circle-outline" size={20} />
              <Text style={styles.emptyText}>Open settings and choose at least one audio source.</Text>
            </Pressable>
          ) : null}

                </View>
                <View style={styles.verseHeading}>
                  <View><Text style={styles.verseEyebrow}>PLAYLIST</Text><Text style={styles.verseTitle}>Tap an Ayah to move the playhead</Text></View>
                  <Text style={styles.verseCount}>{playbackRows.length} AYAHS</Text>
                </View>
              </>
            )}
            ListEmptyComponent={versesLoading ? <ActivityIndicator color={colors.gold} size="large" style={styles.listLoader} /> : null}
            onScrollBeginDrag={() => setFollowingPlayback(false)}
            onScrollToIndexFailed={({ index }) => setTimeout(() => verseListRef.current?.scrollToIndex({ animated: true, index, viewPosition: 0.42 }), 250)}
            ref={verseListRef}
            renderItem={({ item, index }) => {
              const playing = speech.status !== 'idle' && speech.currentVerseKey === item.key;
              const selected = !playing && selectedVerseKey === item.key;
              const showSurah = index === 0 || playbackRows[index - 1]?.surahNumber !== item.surahNumber;
              return (
                <>
                  {showSurah ? <Text style={styles.surahDivider}>SURAH {item.surahNumber} · {surahs.data?.[item.surahNumber - 1]?.nameTransliterated}</Text> : null}
                  <Pressable
                    accessibilityLabel={`Set playhead to Ayah ${item.key}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: playing || selected }}
                    onPress={() => selectPlayhead(index)}
                    style={({ pressed }) => [styles.verseCard, playing ? styles.versePlaying : null, selected ? styles.verseSelected : null, pressed ? styles.versePressed : null]}
                  >
                    <View style={styles.verseTopline}>
                      <View style={[styles.playheadMarker, playing ? styles.playheadMarkerActive : null]}>
                        <Ionicons color={playing ? colors.paperLight : colors.gold} name={playing ? 'volume-high' : selected ? 'play' : 'ellipse-outline'} size={14} />
                      </View>
                      <Text style={styles.verseKey}>AYAH {item.key}</Text>
                      {playing ? <Text style={styles.playingLabel}>{speech.phase === 'translation' ? 'TRANSLATION' : 'RECITING'}</Text> : selected ? <Text style={styles.selectedLabel}>START HERE</Text> : null}
                    </View>
                    <Text selectable style={styles.verseArabic}>{item.arabic} <Text style={styles.verseNumber}>﴿{item.ayahNumber}﴾</Text></Text>
                    {item.translation ? <View style={styles.verseRule} /> : null}
                    {item.translation ? <Text selectable style={styles.verseTranslation}>{item.translation}</Text> : null}
                  </Pressable>
                </>
              );
            }}
            showsVerticalScrollIndicator={false}
          />
          <View style={styles.stickyControls}>
            <Pressable accessibilityLabel="Stop" disabled={speech.status === 'idle'} onPress={() => void speech.stop()} style={[styles.compactControl, speech.status === 'idle' ? styles.disabled : null]}>
              <Ionicons color={colors.oxblood} name="stop" size={19} />
            </Pressable>
            <Pressable
              accessibilityLabel={speech.status === 'paused' ? 'Resume' : isActive ? 'Pause' : 'Play'}
              disabled={!hasSource || versesLoading || !playbackRows.length}
              onPress={() => speech.status === 'paused' ? void speech.resume() : isActive ? void speech.pause() : void beginPlayback()}
              style={[styles.compactPlayControl, !hasSource || versesLoading || !playbackRows.length ? styles.disabled : null]}
            >
              {versesLoading || speech.status === 'loading'
                ? <ActivityIndicator color={colors.paperLight} size="small" />
                : <Ionicons color={colors.paperLight} name={isActive ? 'pause' : 'play'} size={23} />}
            </Pressable>
            <View style={styles.controllerStatus}>
              <Text numberOfLines={1} style={styles.controllerRange}>
                SURAH {startSurah}–{endSurah}{rangeRepeat > 1 ? ` · RANGE ${speech.status === 'idle' ? 1 : speech.rangeIteration}/${rangeRepeat}` : ''}
              </Text>
              <Text numberOfLines={1} style={styles.controllerAyah}>
                {speech.status !== 'idle' && speech.currentVerseKey
                  ? `Ayah ${speech.currentVerseKey}`
                  : selectedVerseKey ? `Start ${selectedVerseKey}` : 'From the beginning'}
              </Text>
            </View>
            <CompactVolumeControl onChange={changeVolume} value={volume} />
            <Pressable accessibilityLabel="Open settings" onPress={() => setSettingsOpen(true)} style={styles.compactControl}>
              <Ionicons color={colors.emerald} name="options-outline" size={20} />
            </Pressable>
          </View>
          {!followingPlayback && currentIndex >= 0 && speech.status !== 'idle' ? (
            <Pressable
              accessibilityLabel="Follow the currently playing Ayah"
              onPress={() => {
                setFollowingPlayback(true);
                verseListRef.current?.scrollToIndex({ animated: true, index: currentIndex, viewPosition: 0.42 });
              }}
              style={styles.followButton}
            >
              <Ionicons color={colors.paperLight} name="locate" size={18} />
              <Text style={styles.followText}>Follow Ayah {speech.currentVerseKey}</Text>
            </Pressable>
          ) : null}
        </View>
      </FolioScreen>

      <Modal animationType="slide" onRequestClose={() => setSettingsOpen(false)} statusBarTranslucent transparent visible={settingsOpen}>
        <View style={styles.modalRoot}>
          <Pressable accessibilityLabel="Close settings" onPress={() => setSettingsOpen(false)} style={StyleSheet.absoluteFill} />
          <SafeAreaView edges={['bottom']} style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetEyebrow}>PLAYER PREFERENCES</Text>
                <Text style={styles.sheetTitle}>Recitation settings</Text>
              </View>
              <Pressable accessibilityLabel="Close settings" onPress={() => setSettingsOpen(false)} style={styles.closeButton}>
                <Ionicons color={colors.ink} name="close" size={25} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
              <SettingSection title="Reciter">
                <Choice label="None" onPress={() => selectReciter(null)} selected={!reciterId} />
                {RECITERS.map((reciter) => <Choice key={reciter.id} label={reciter.name} meta={reciter.style} onPress={() => selectReciter(reciter.id)} selected={reciterId === reciter.id} />)}
              </SettingSection>

              <SettingSection title="Translation">
                <Choice label="None" onPress={() => selectTranslation(null)} selected={!translation} />
                {translations.data?.map((item) => <Choice key={item.id} label={item.title} meta={`${item.language} · ${item.translator}`} onPress={() => selectTranslation(item.id)} selected={translation?.id === item.id} />)}
                {!translations.isLoading && !translations.data?.length ? <Text style={styles.help}>Import a translation from the Library to make it available here.</Text> : null}
              </SettingSection>

              <SettingSection title="Volume">
                <Stepper label="Playback volume" max={100} min={0} onChange={(next) => changeVolume(next / 100)} suffix="%" step={10} value={Math.round(volume * 100)} />
              </SettingSection>

              <SettingSection title="Surah range">
                <RangeChoice label="From" name={startName} number={startSurah} onPress={() => setRangePicker('start')} />
                <RangeChoice label="To" name={endName} number={endSurah} onPress={() => setRangePicker('end')} />
              </SettingSection>

              <SettingSection title="Repeat">
                <Stepper label="Range repeat" max={20} min={1} onChange={(next) => { stopForChange(); setRangeRepeatOverride(next); persistNumber(keys.rangeRepeat, next); }} suffix="×" value={rangeRepeat} />
                <Stepper label="Individual Ayah repeat" max={20} min={1} onChange={(next) => { stopForChange(); setAyahRepeatOverride(next); persistNumber(keys.ayahRepeat, next); }} suffix="×" value={ayahRepeat} />
              </SettingSection>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      <Modal animationType="slide" onRequestClose={() => setRangePicker(null)} transparent visible={rangePicker !== null}>
        <View style={styles.modalRoot}>
          <Pressable accessibilityLabel="Close Surah picker" onPress={() => setRangePicker(null)} style={StyleSheet.absoluteFill} />
          <SafeAreaView edges={['bottom']} style={[styles.sheet, styles.pickerSheet]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View><Text style={styles.sheetEyebrow}>SURAH RANGE</Text><Text style={styles.sheetTitle}>Choose {rangePicker === 'start' ? 'starting' : 'ending'} Surah</Text></View>
              <Pressable accessibilityLabel="Close Surah picker" onPress={() => setRangePicker(null)} style={styles.closeButton}><Ionicons color={colors.ink} name="close" size={25} /></Pressable>
            </View>
            <FlatList
              contentContainerStyle={styles.pickerList}
              data={(surahs.data ?? []).filter((surah) => rangePicker !== 'end' || surah.number >= startSurah)}
              keyExtractor={(item) => String(item.number)}
              renderItem={({ item }) => {
                const selected = item.number === (rangePicker === 'start' ? startSurah : endSurah);
                return (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => {
                      if (rangePicker === 'start') changeStart(item.number); else changeEnd(item.number);
                      setRangePicker(null);
                    }}
                    style={[styles.surahOption, selected ? styles.choiceSelected : null]}
                  >
                    <Text style={styles.surahNumber}>{item.number}</Text>
                    <Text style={styles.surahName}>{item.nameTransliterated}</Text>
                    <Text style={styles.surahArabic}>{item.nameArabic}</Text>
                    {selected ? <Ionicons color={colors.emerald} name="checkmark-circle" size={21} /> : null}
                  </Pressable>
                );
              }}
            />
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

function SettingSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

function Choice({ label, meta, selected, onPress }: { label: string; meta?: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.choice, selected ? styles.choiceSelected : null]}>
      <View style={styles.choiceCopy}><Text style={styles.choiceLabel}>{label}</Text>{meta ? <Text style={styles.choiceMeta}>{meta}</Text> : null}</View>
      <Ionicons color={selected ? colors.emerald : colors.border} name={selected ? 'radio-button-on' : 'radio-button-off'} size={21} />
    </Pressable>
  );
}

function RangeChoice({ label, name, number, onPress }: { label: string; name: string; number: number; onPress: () => void }) {
  return (
    <Pressable accessibilityLabel={`${label} Surah, currently ${number} ${name}`} onPress={onPress} style={styles.rangeChoice}>
      <View style={styles.rangeNumber}><Text style={styles.rangeNumberText}>{number}</Text></View>
      <View style={styles.choiceCopy}><Text style={styles.choiceMeta}>{label.toUpperCase()}</Text><Text style={styles.choiceLabel}>{name}</Text></View>
      <Ionicons color={colors.gold} name="chevron-down" size={19} />
    </Pressable>
  );
}

function Stepper({ label, value, min, max, step = 1, suffix = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void }) {
  return (
    <View style={styles.stepper}>
      <View style={styles.stepperCopy}><Text style={styles.stepperLabel}>{label}</Text><Text style={styles.stepperValue}>{value}{suffix}</Text></View>
      <View style={styles.stepperButtons}>
        <Pressable accessibilityLabel={`Decrease ${label}`} disabled={value <= min} onPress={() => onChange(Math.max(min, value - step))} style={[styles.stepButton, value <= min ? styles.disabled : null]}><Ionicons color={colors.emerald} name="remove" size={20} /></Pressable>
        <Pressable accessibilityLabel={`Increase ${label}`} disabled={value >= max} onPress={() => onChange(Math.min(max, value + step))} style={[styles.stepButton, value >= max ? styles.disabled : null]}><Ionicons color={colors.emerald} name="add" size={20} /></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0 },
  playerCard: { backgroundColor: colors.emerald, borderRadius: 4, marginBottom: spacing.md, overflow: 'hidden', padding: 22 },
  playerTopline: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  playerCopy: { flex: 1 },
  sourceLabel: { color: colors.paperLight, fontFamily: fontFamilies.display, fontSize: 25, lineHeight: 30 },
  rangeLabel: { color: colors.goldLight, fontFamily: fontFamilies.body, fontSize: 15, marginTop: 3 },
  emptyPrompt: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', flexDirection: 'row', gap: 8, marginTop: 14, padding: 12 },
  emptyText: { color: colors.paperLight, flex: 1, fontFamily: fontFamilies.body, fontSize: 15 },
  disabled: { opacity: 0.35 },
  verseListShell: { flex: 1, position: 'relative' },
  verseList: { paddingBottom: 118 },
  verseHeading: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, marginTop: 4 },
  verseEyebrow: { color: colors.gold, fontFamily: fontFamilies.bodyBold, fontSize: 10, letterSpacing: 1.4 },
  verseTitle: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 21 },
  verseCount: { color: colors.inkMuted, fontFamily: fontFamilies.bodyBold, fontSize: 10, letterSpacing: 1.1, paddingBottom: 3 },
  listLoader: { marginTop: 36 },
  surahDivider: { color: colors.gold, fontFamily: fontFamilies.bodyBold, fontSize: 11, letterSpacing: 1.4, marginBottom: 8, marginTop: 10 },
  verseCard: { backgroundColor: colors.paperLight, borderColor: colors.border, borderRadius: 3, borderWidth: 1, marginBottom: 12, padding: 17 },
  versePlaying: { backgroundColor: colors.emeraldLight, borderColor: colors.emerald, borderWidth: 2 },
  verseSelected: { borderColor: colors.gold, borderWidth: 2 },
  versePressed: { opacity: 0.8 },
  verseTopline: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  playheadMarker: { alignItems: 'center', borderColor: colors.gold, borderRadius: 14, borderWidth: 1, height: 28, justifyContent: 'center', width: 28 },
  playheadMarkerActive: { backgroundColor: colors.emerald, borderColor: colors.emerald },
  verseKey: { color: colors.inkMuted, flex: 1, fontFamily: fontFamilies.bodyBold, fontSize: 11, letterSpacing: 1.1 },
  playingLabel: { color: colors.emerald, fontFamily: fontFamilies.bodyBold, fontSize: 10, letterSpacing: 1.1 },
  selectedLabel: { color: colors.gold, fontFamily: fontFamilies.bodyBold, fontSize: 10, letterSpacing: 1.1 },
  verseArabic: { color: colors.ink, fontFamily: fontFamilies.arabic, fontSize: 27, lineHeight: 47, marginTop: 8, textAlign: 'right', writingDirection: 'rtl' },
  verseNumber: { color: colors.gold, fontFamily: fontFamilies.arabic, fontSize: 20 },
  verseRule: { backgroundColor: colors.gold, height: 1, marginVertical: 12, opacity: 0.45, width: 30 },
  verseTranslation: { color: colors.ink, fontFamily: fontFamilies.body, fontSize: 18, lineHeight: 25 },
  stickyControls: { alignItems: 'center', alignSelf: 'center', backgroundColor: colors.paperLight, borderColor: colors.border, borderRadius: 28, borderWidth: 1, bottom: 10, elevation: 6, flexDirection: 'row', gap: 6, justifyContent: 'center', maxWidth: '94%', minWidth: 320, paddingHorizontal: 10, paddingVertical: 6, position: 'absolute', shadowColor: '#000', shadowOffset: { height: 2, width: 0 }, shadowOpacity: 0.2, shadowRadius: 5, width: 'auto' },
  compactControl: { alignItems: 'center', borderRadius: 20, height: 40, justifyContent: 'center', width: 42 },
  compactPlayControl: { alignItems: 'center', backgroundColor: colors.emerald, borderRadius: 22, height: 44, justifyContent: 'center', width: 48 },
  controllerStatus: { minWidth: 150, paddingHorizontal: 6 },
  controllerRange: { color: colors.gold, fontFamily: fontFamilies.bodyBold, fontSize: 9, letterSpacing: 0.9 },
  controllerAyah: { color: colors.ink, fontFamily: fontFamilies.bodyBold, fontSize: 13, marginTop: 1 },
  followButton: { alignItems: 'center', alignSelf: 'center', backgroundColor: colors.emerald, borderRadius: 22, bottom: 70, elevation: 4, flexDirection: 'row', gap: 7, paddingHorizontal: 16, paddingVertical: 10, position: 'absolute', shadowColor: '#000', shadowOffset: { height: 2, width: 0 }, shadowOpacity: 0.22, shadowRadius: 4 },
  followText: { color: colors.paperLight, fontFamily: fontFamilies.bodyBold, fontSize: 14 },
  modalRoot: { backgroundColor: 'rgba(12,24,20,0.5)', flex: 1, justifyContent: 'flex-end' },
  sheet: { alignSelf: 'center', backgroundColor: colors.paper, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '91%', maxWidth: 760, overflow: 'hidden', width: '100%' },
  sheetHandle: { alignSelf: 'center', backgroundColor: colors.border, borderRadius: 2, height: 4, marginTop: 9, width: 44 },
  sheetHeader: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 22, paddingVertical: 14 },
  sheetEyebrow: { color: colors.gold, fontFamily: fontFamilies.bodyBold, fontSize: 10, letterSpacing: 1.5 },
  sheetTitle: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 25 },
  closeButton: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 },
  sheetContent: { padding: 18, paddingBottom: 36 },
  pickerSheet: { height: '78%' },
  pickerList: { padding: 18, paddingBottom: 36 },
  section: { backgroundColor: colors.paperLight, borderColor: colors.border, borderRadius: 3, borderWidth: 1, marginBottom: 14, padding: 15 },
  sectionTitle: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 21, marginBottom: 8 },
  choice: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, minHeight: 50, paddingHorizontal: 8, paddingVertical: 8 },
  choiceSelected: { backgroundColor: colors.emeraldLight },
  choiceCopy: { flex: 1 },
  choiceLabel: { color: colors.ink, fontFamily: fontFamilies.bodyBold, fontSize: 16 },
  choiceMeta: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 13 },
  rangeChoice: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, minHeight: 62, paddingHorizontal: 8, paddingVertical: 8 },
  rangeNumber: { alignItems: 'center', borderColor: colors.gold, borderRadius: 19, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  rangeNumberText: { color: colors.emerald, fontFamily: fontFamilies.bodyBold, fontSize: 14 },
  surahOption: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, minHeight: 58, paddingHorizontal: 10 },
  surahNumber: { color: colors.gold, fontFamily: fontFamilies.bodyBold, fontSize: 13, width: 28 },
  surahName: { color: colors.ink, flex: 1, fontFamily: fontFamilies.bodyBold, fontSize: 17 },
  surahArabic: { color: colors.emerald, fontFamily: fontFamilies.arabic, fontSize: 19 },
  help: { color: colors.inkMuted, fontFamily: fontFamilies.displayItalic, fontSize: 15, paddingVertical: 8 },
  stepper: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, minHeight: 64, paddingVertical: 8 },
  stepperCopy: { flex: 1 },
  stepperLabel: { color: colors.ink, fontFamily: fontFamilies.body, fontSize: 16 },
  stepperValue: { color: colors.gold, fontFamily: fontFamilies.bodyBold, fontSize: 15, marginTop: 2 },
  stepperButtons: { flexDirection: 'row', gap: 7 },
  stepButton: { alignItems: 'center', backgroundColor: colors.emeraldLight, borderRadius: 18, height: 36, justifyContent: 'center', width: 40 },
});
