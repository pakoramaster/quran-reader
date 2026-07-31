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
import {
  DEFAULT_VOICE_PROFILE_ID,
  getVoiceProfile,
  isVoiceProfileId,
  resolveVoiceForProfile,
  VOICE_PROFILES,
} from '@/features/speech/domain/voiceProfiles';
import { getActiveTranslationId, getTranslation } from '@/features/translations/data/translationRepository';
import { colors, fontFamilies, spacing } from '@/theme/tokens';

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
      profile: await getSetting(userDb, 'tts_voice_profile'),
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
  const selectedProfileId = isVoiceProfileId(speechSettings.data?.profile)
    ? speechSettings.data.profile
    : DEFAULT_VOICE_PROFILE_ID;
  const selectedProfile = getVoiceProfile(selectedProfileId);
  const resolvedVoice = useMemo(
    () => activeTranslation.data
      ? resolveVoiceForProfile(voices, activeTranslation.data.language, selectedProfileId)
      : undefined,
    [activeTranslation.data, selectedProfileId, voices],
  );

  return (
    <FolioScreen
      eyebrow="Reading room preferences"
      subtitle="Four consistent voice profiles keep translation playback familiar across the app. Qur’an recitations stream on demand."
      title="Settings"
    >
      <Section icon="volume-medium-outline" title="Read aloud">
        {activeTranslation.data ? (
          <>
            <Text style={styles.copy}>Voice profile for {activeTranslation.data.title} ({activeTranslation.data.language})</Text>
            {VOICE_PROFILES.map((profile) => {
              const selected = selectedProfileId === profile.id;
              return (
                <Pressable
                  key={profile.id}
                  onPress={() => save.mutate({ key: 'tts_voice_profile', value: profile.id })}
                  style={[styles.optionRow, selected ? styles.optionSelected : null]}
                >
                  <View style={styles.optionCopy}>
                    <Text style={styles.optionTitle}>{profile.name}</Text>
                    <Text style={styles.optionMeta}>{profile.description}</Text>
                  </View>
                  {selected ? <Ionicons color={colors.emerald} name="checkmark-circle" size={21} /> : null}
                </Pressable>
              );
            })}
            {!resolvedVoice ? <Text style={styles.warning}>No {activeTranslation.data.language} speech voice is installed. Add one in your device speech settings to hear this translation.</Text> : null}
            <FolioButton
              label="Test current voice"
              onPress={() => speech.speakAyah(
                { key: '1:1', text: 'This translation is ready for offline reading.' },
                activeTranslation.data!.language,
                resolvedVoice?.identifier,
                selectedProfile.rate,
                selectedProfile.pitch,
              )}
              style={styles.testButton}
              variant="secondary"
            />
            <Text style={styles.footnote}>
              Voice profile names and pacing are uniform across platforms; the exact timbre depends on the offline speech engine installed on the device. {Platform.OS === 'android'
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
  testButton: { marginTop: 16 },
  footnote: { color: colors.inkMuted, fontFamily: fontFamilies.displayItalic, fontSize: 15, lineHeight: 20, marginTop: 12 },
  info: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 9 },
  infoLabel: { color: colors.inkMuted, fontFamily: fontFamilies.bodyBold, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase' },
  infoValue: { color: colors.ink, fontFamily: fontFamilies.body, fontSize: 17, marginTop: 2 },
  attribution: { alignItems: 'center', marginTop: spacing.md, padding: spacing.md },
  attributionTitle: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 20 },
  attributionBody: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 14, lineHeight: 19, marginTop: 3, textAlign: 'center' },
});
