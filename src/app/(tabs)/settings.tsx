import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Speech from 'expo-speech';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { FolioButton } from '@/components/FolioButton';
import { FolioScreen } from '@/components/FolioScreen';
import { useUserDatabase } from '@/data/databases/UserDatabaseProvider';
import { getQuranMetadata } from '@/features/quran-reader/data/quranRepository';
import { getSetting, setSetting } from '@/features/settings/data/settingsRepository';
import { useSpeech } from '@/features/speech/application/SpeechProvider';
import { getActiveTranslationId, getTranslation } from '@/features/translations/data/translationRepository';
import { colors, fontFamilies, spacing } from '@/theme/tokens';

const rates = [0.75, 0.9, 1.1];

export default function SettingsScreen() {
  const quranDb = useSQLiteContext();
  const userDb = useUserDatabase();
  const queryClient = useQueryClient();
  const speech = useSpeech();
  const [voices, setVoices] = useState<Speech.Voice[]>([]);
  const metadata = useQuery({ queryKey: ['quran-metadata'], queryFn: () => getQuranMetadata(quranDb), staleTime: Infinity });
  const activeTranslation = useQuery({
    queryKey: ['active-translation'],
    queryFn: async () => {
      const id = await getActiveTranslationId(userDb);
      return id ? getTranslation(userDb, id) : null;
    },
  });
  const speechSettings = useQuery({
    queryKey: ['speech-settings', activeTranslation.data?.language],
    queryFn: async () => ({
      voice: await getSetting(userDb, `tts_voice_${activeTranslation.data!.language}`),
      rate: Number(await getSetting(userDb, 'tts_rate')) || 0.9,
    }),
    enabled: Boolean(activeTranslation.data?.language),
  });
  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => setSetting(userDb, key, value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['speech-settings'] }),
  });

  useEffect(() => {
    void Speech.getAvailableVoicesAsync().then(setVoices).catch(() => setVoices([]));
  }, []);
  const matchingVoices = useMemo(() => {
    const language = activeTranslation.data?.language.toLowerCase();
    if (!language) return [];
    const base = language.split('-')[0];
    return voices.filter((voice) => voice.language.toLowerCase().startsWith(base ?? language));
  }, [activeTranslation.data?.language, voices]);

  return (
    <FolioScreen
      eyebrow="Reading room preferences"
      subtitle="Translation voices come from the operating system. Qur’an recitations stream on demand; reading, translations, and notes remain local."
      title="Settings"
    >
      <Section icon="volume-medium-outline" title="Read aloud">
        {activeTranslation.data ? (
          <>
            <Text style={styles.copy}>Voice for {activeTranslation.data.title} ({activeTranslation.data.language})</Text>
            {matchingVoices.length ? matchingVoices.slice(0, 8).map((voice) => {
              const selected = speechSettings.data?.voice === voice.identifier;
              return (
                <Pressable
                  key={voice.identifier}
                  onPress={() => save.mutate({ key: `tts_voice_${activeTranslation.data!.language}`, value: voice.identifier })}
                  style={[styles.optionRow, selected ? styles.optionSelected : null]}
                >
                  <View style={styles.optionCopy}>
                    <Text style={styles.optionTitle}>{voice.name}</Text>
                    <Text style={styles.optionMeta}>{voice.language} · {voice.quality}</Text>
                  </View>
                  {selected ? <Ionicons color={colors.emerald} name="checkmark-circle" size={21} /> : null}
                </Pressable>
              );
            }) : <Text style={styles.warning}>No matching voice is installed. Add a {activeTranslation.data.language} voice in your device accessibility or speech settings.</Text>}
            <Text style={styles.label}>SPEECH RATE</Text>
            <View style={styles.rateRow}>
              {rates.map((rate) => (
                <Pressable
                  key={rate}
                  onPress={() => save.mutate({ key: 'tts_rate', value: String(rate) })}
                  style={[styles.rateChip, speechSettings.data?.rate === rate ? styles.rateChipActive : null]}
                >
                  <Text style={[styles.rateText, speechSettings.data?.rate === rate ? styles.rateTextActive : null]}>{rate}×</Text>
                </Pressable>
              ))}
            </View>
            <FolioButton
              label="Test current voice"
              onPress={() => speech.speakAyah(
                { key: '1:1', text: 'This translation is ready for offline reading.' },
                activeTranslation.data!.language,
                speechSettings.data?.voice ?? undefined,
                speechSettings.data?.rate,
              )}
              style={styles.testButton}
              variant="secondary"
            />
            <Text style={styles.footnote}>
              {Platform.OS === 'android'
                ? 'On Android, pause stops speech and resume restarts the current Ayah.'
                : 'On iPhone, speech may be silent when the hardware silent switch is enabled.'}
            </Text>
          </>
        ) : <Text style={styles.copy}>Import a translation before choosing its read-aloud voice.</Text>}
      </Section>

      <Section icon="shield-checkmark-outline" title="Arabic text integrity">
        <Info label="Source" value={metadata.data?.source_name ?? 'Tanzil Project'} />
        <Info label="Edition" value={metadata.data?.source_version ?? 'Uthmani 1.1'} />
        <Info label="Coverage" value={`${metadata.data?.surah_count ?? 114} Surahs · ${metadata.data?.ayah_count ?? 6236} Ayahs`} />
        <Info label="License" value={metadata.data?.license ?? 'Creative Commons Attribution 3.0'} />
        <Text style={styles.footnote}>The Arabic database is physically separate from translations and opened in SQLite query-only mode. Tanzil text is distributed verbatim and cannot be edited here.</Text>
      </Section>

      <Section icon="lock-closed-outline" title="Privacy & storage">
        <Text style={styles.copy}>No account, analytics service, or app backend is used. Recitation audio is requested from EveryAyah only when you press play; imports, notes, highlights, and preferences stay inside the app sandbox.</Text>
        <Text style={styles.warning}>Uninstalling the app may remove your imported translations and annotations. Local storage is private, but it is not a backup.</Text>
      </Section>

      <View style={styles.attribution}>
        <Text style={styles.attributionTitle}>Tanzil Quran Text</Text>
        <Text style={styles.attributionBody}>Copyright © 2007–2026 Tanzil Project · Creative Commons Attribution 3.0 · tanzil.net</Text>
        <Text style={styles.attributionBody}>Verse-by-verse recitation audio provided by EveryAyah.com.</Text>
      </View>
    </FolioScreen>
  );
}

function Section({ icon, title, children }: { icon: keyof typeof Ionicons.glyphMap; title: string; children: React.ReactNode }) {
  return <View style={styles.section}><View style={styles.sectionHeading}><Ionicons color={colors.gold} name={icon} size={22} /><Text style={styles.sectionTitle}>{title}</Text></View>{children}</View>;
}
function Info({ label, value }: { label: string; value: string }) {
  return <View style={styles.info}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  section: { backgroundColor: colors.paperLight, borderColor: colors.border, borderRadius: 3, borderWidth: 1, marginBottom: 16, padding: 18 },
  sectionHeading: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', gap: 10, marginBottom: 14, paddingBottom: 12 },
  sectionTitle: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 25 },
  copy: { color: colors.ink, fontFamily: fontFamilies.body, fontSize: 17, lineHeight: 23 },
  optionRow: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', paddingVertical: 10 },
  optionSelected: { backgroundColor: colors.emeraldLight, marginHorizontal: -8, paddingHorizontal: 8 },
  optionCopy: { flex: 1 },
  optionTitle: { color: colors.ink, fontFamily: fontFamilies.bodyBold, fontSize: 16 },
  optionMeta: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 14 },
  warning: { backgroundColor: '#F4E5D1', color: colors.oxblood, fontFamily: fontFamilies.body, fontSize: 16, lineHeight: 21, marginTop: 12, padding: 12 },
  label: { color: colors.inkMuted, fontFamily: fontFamilies.bodyBold, fontSize: 10, letterSpacing: 1.4, marginTop: 18 },
  rateRow: { flexDirection: 'row', gap: 9, marginTop: 8 },
  rateChip: { alignItems: 'center', borderColor: colors.border, borderRadius: 2, borderWidth: 1, minWidth: 62, padding: 9 },
  rateChipActive: { backgroundColor: colors.emerald, borderColor: colors.emerald },
  rateText: { color: colors.ink, fontFamily: fontFamilies.bodyBold, fontSize: 15 },
  rateTextActive: { color: colors.paperLight },
  testButton: { marginTop: 16 },
  footnote: { color: colors.inkMuted, fontFamily: fontFamilies.displayItalic, fontSize: 15, lineHeight: 20, marginTop: 12 },
  info: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 9 },
  infoLabel: { color: colors.inkMuted, fontFamily: fontFamilies.bodyBold, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase' },
  infoValue: { color: colors.ink, fontFamily: fontFamilies.body, fontSize: 17, marginTop: 2 },
  attribution: { alignItems: 'center', marginTop: spacing.md, padding: spacing.md },
  attributionTitle: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 20 },
  attributionBody: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 14, lineHeight: 19, marginTop: 3, textAlign: 'center' },
});
