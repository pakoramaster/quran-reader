import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { router } from 'expo-router';

import { FolioButton } from '@/components/FolioButton';
import { FolioScreen } from '@/components/FolioScreen';
import { useUserDatabase } from '@/data/databases/UserDatabaseProvider';
import { createBackupArchive, inspectBackupArchive, restoreBackupArchive } from '@/features/backup/data/backupRepository';
import { getQuranMetadata } from '@/features/quran-reader/data/quranRepository';
import { getSetting, setSetting } from '@/features/settings/data/settingsRepository';
import {
  DEFAULT_READING_FONT_SIZE_ID,
  isReadingFontSizeId,
  READING_FONT_SIZES,
} from '@/features/settings/domain/readingFontSizes';
import { useSpeech } from '@/features/speech/application/SpeechProvider';
import {
  ensureUniformVoiceModel,
  isUniformVoiceModelReady,
  type UniformVoiceProgress,
} from '@/features/speech/data/uniformTtsEngine';
import {
  DEFAULT_VOICE_PROFILE_ID,
  isVoiceProfileId,
  VOICE_PROFILES,
} from '@/features/speech/domain/voiceProfiles';
import {
  DEFAULT_TTS_SPEED_ID,
  getTtsSpeed,
  isTtsSpeedId,
  TTS_SPEEDS,
} from '@/features/speech/domain/ttsSpeeds';
import { getActiveTranslationId, getTranslation } from '@/features/translations/data/translationRepository';
import { pickBackupFile, saveBackupFile } from '@/platform/backups/backupFiles';
import { requestConfirmation, showMessage } from '@/platform/dialogs/dialogs';
import { colors, fontFamilies, spacing } from '@/theme/tokens';

export default function SettingsScreen() {
  const quranDb = useSQLiteContext();
  const userDb = useUserDatabase();
  const queryClient = useQueryClient();
  const speech = useSpeech();
  const [voiceProgress, setVoiceProgress] = useState<UniformVoiceProgress | null>(null);
  const [testingVoice, setTestingVoice] = useState(false);
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
      speed: await getSetting(userDb, 'tts_speed'),
    }),
    enabled: Boolean(activeTranslation.data?.language),
  });
  const readingFontSize = useQuery({
    queryKey: ['reading-font-size'],
    queryFn: () => getSetting(userDb, 'reading_font_size'),
  });
  const uniformVoiceModel = useQuery({
    queryKey: ['uniform-voice-model'],
    queryFn: isUniformVoiceModelReady,
  });
  const installVoiceModel = useMutation({
    mutationFn: () => ensureUniformVoiceModel(setVoiceProgress),
    onError: (error) => showMessage('Voice pack could not be downloaded', error instanceof Error ? error.message : 'The download failed.'),
    onSettled: () => setVoiceProgress(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['uniform-voice-model'] }),
  });
  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => setSetting(userDb, key, value),
    onSuccess: async (_result, variables) => {
      if (variables.key === 'reading_font_size') {
        await queryClient.invalidateQueries({ queryKey: ['reading-font-size'] });
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['speech-settings'] }),
        queryClient.invalidateQueries({ queryKey: ['recitation-player-settings'] }),
      ]);
    },
  });
  const backup = useMutation({
    mutationFn: async () => {
      const archive = await createBackupArchive(userDb);
      const date = new Date(archive.summary.createdAt).toISOString().slice(0, 10);
      await saveBackupFile(archive.bytes, `quran-folio-backup-${date}.quranfolio`);
      return archive.summary;
    },
    onError: (error) => showMessage('Backup could not be created', error instanceof Error ? error.message : 'The backup failed.'),
  });
  const restore = useMutation({
    mutationFn: async (bytes: Uint8Array) => {
      await speech.stop();
      return restoreBackupArchive(userDb, bytes);
    },
    onError: (error) => showMessage('Backup could not be restored', error instanceof Error ? error.message : 'The restore failed.'),
    onSuccess: async (summary) => {
      await queryClient.invalidateQueries();
      showMessage('Backup restored', `${summary.translationCount} translations, ${summary.annotationCount} notes or highlights, and ${summary.downloadedSurahCount} downloaded recitations were restored.`);
    },
  });
  const chooseBackupToRestore = async () => {
    try {
      const bytes = await pickBackupFile();
      if (!bytes) return;
      const { summary } = inspectBackupArchive(bytes);
      requestConfirmation({
        title: 'Replace local data with this backup?',
        message: `Created ${new Date(summary.createdAt).toLocaleString()}. It contains ${summary.translationCount} translations, ${summary.annotationCount} notes or highlights, and ${summary.downloadedSurahCount} downloaded recitations. Current local data will be replaced.`,
        confirmLabel: 'Restore backup',
        destructive: true,
        onConfirm: () => restore.mutate(bytes),
      });
    } catch (error) {
      showMessage('Backup could not be opened', error instanceof Error ? error.message : 'The selected file is invalid.');
    }
  };

  const selectedProfileId = isVoiceProfileId(speechSettings.data?.profile)
    ? speechSettings.data.profile
    : DEFAULT_VOICE_PROFILE_ID;
  const selectedSpeedId = isTtsSpeedId(speechSettings.data?.speed)
    ? speechSettings.data.speed
    : DEFAULT_TTS_SPEED_ID;
  const selectedSpeed = getTtsSpeed(selectedSpeedId);
  const selectedReadingFontSize = isReadingFontSizeId(readingFontSize.data)
    ? readingFontSize.data
    : DEFAULT_READING_FONT_SIZE_ID;
  const testCurrentVoice = async () => {
    setTestingVoice(true);
    try {
      if (!uniformVoiceModel.data) {
        await ensureUniformVoiceModel(setVoiceProgress);
        await queryClient.invalidateQueries({ queryKey: ['uniform-voice-model'] });
      }
      speech.speakAyah(
        { key: '1:1', text: 'This translation is ready for offline reading.' },
        activeTranslation.data?.language ?? 'en',
        selectedProfileId,
        selectedSpeed.value,
        1,
      );
    } catch (error) {
      showMessage('Voice could not be prepared', error instanceof Error ? error.message : 'The standard voice pack is unavailable.');
    } finally {
      setVoiceProgress(null);
      setTestingVoice(false);
    }
  };

  return (
    <FolioScreen
      eyebrow="Reading room preferences"
      subtitle="Four shared offline voices keep translation playback consistent across Android, iPhone, and Windows."
      title="Settings"
    >
      <Section icon="text-outline" title="Reading text size">
        <Text style={styles.copy}>Adjust the Arabic verses, translations, recitation playlist, and note excerpts.</Text>
        {READING_FONT_SIZES.map((option) => {
          const selected = selectedReadingFontSize === option.id;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              key={option.id}
              onPress={() => save.mutate({ key: 'reading_font_size', value: option.id })}
              style={[styles.optionRow, selected ? styles.optionSelected : null]}
            >
              <View style={styles.optionCopy}>
                <Text style={[styles.optionTitle, { fontSize: 16 * option.scale }]}>{option.label}</Text>
                <Text style={styles.optionMeta}>{option.description}</Text>
              </View>
              {selected ? <Ionicons color={colors.emerald} name="checkmark-circle" size={21} /> : null}
            </Pressable>
          );
        })}
      </Section>

      <Section icon="volume-medium-outline" title="Read aloud">
        {activeTranslation.data ? (
          <>
            <Text style={styles.copy}>Voice for {activeTranslation.data.title} ({activeTranslation.data.language}). The voice pack is downloaded once and runs privately on this device.</Text>
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
            <Text style={styles.preferenceLabel}>Translation speech speed</Text>
            {TTS_SPEEDS.map((speed) => {
              const selected = selectedSpeedId === speed.id;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={speed.id}
                  onPress={() => save.mutate({ key: 'tts_speed', value: speed.id })}
                  style={[styles.optionRow, selected ? styles.optionSelected : null]}
                >
                  <View style={styles.optionCopy}>
                    <Text style={styles.optionTitle}>{speed.label}</Text>
                    <Text style={styles.optionMeta}>{speed.description}</Text>
                  </View>
                  {selected ? <Ionicons color={colors.emerald} name="checkmark-circle" size={21} /> : null}
                </Pressable>
              );
            })}
            {!uniformVoiceModel.data ? (
              <FolioButton
                label={voiceProgress ? `${voiceProgress.phase} · ${Math.round(voiceProgress.percent)}%` : 'Download standard voice pack'}
                disabled={testingVoice}
                loading={installVoiceModel.isPending}
                onPress={() => installVoiceModel.mutate()}
                style={styles.testButton}
                variant="secondary"
              />
            ) : <Text style={styles.ready}>Standard voice pack ready offline</Text>}
            <FolioButton
              label="Test current voice"
              disabled={installVoiceModel.isPending}
              loading={testingVoice}
              onPress={() => void testCurrentVoice()}
              style={styles.testButton}
              variant="secondary"
            />
            <Text style={styles.footnote}>
              These are fixed speakers from the same quantized KokoroTTS model on every supported platform, rather than voices supplied by the operating system. This voice pack currently reads English translations.
            </Text>
          </>
        ) : <Text style={styles.copy}>Import a translation before choosing its read-aloud voice.</Text>}
      </Section>

      <Section icon="download-outline" title="Offline recitation">
        <Text style={styles.copy}>Download individual Surahs for either reciter. The player uses saved MP3 files automatically and only streams missing verses.</Text>
        <FolioButton label="Manage recitation downloads" onPress={() => router.push('/downloads')} style={styles.testButton} variant="secondary" />
      </Section>

      <Section icon="archive-outline" title="Backup & restore">
        <Text style={styles.copy}>Create one portable file containing imported translations, notes, highlights, preferences, and every downloaded recitation MP3.</Text>
        <FolioButton label="Create backup" loading={backup.isPending} onPress={() => backup.mutate()} style={styles.testButton} />
        <FolioButton label="Restore from backup" loading={restore.isPending} onPress={() => void chooseBackupToRestore()} style={styles.restoreButton} variant="secondary" />
        <Text style={styles.footnote}>Restoring replaces the user data currently stored on this device. The verified Arabic Quran database is bundled with the app and is not duplicated in backups.</Text>
      </Section>

      <Section icon="shield-checkmark-outline" title="Arabic text integrity">
        <Info label="Source" value={metadata.data?.source_name ?? 'Tanzil Project'} />
        <Info label="Edition" value={metadata.data?.source_version ?? 'Uthmani 1.1'} />
        <Info label="Coverage" value={`${metadata.data?.surah_count ?? 114} Surahs · ${metadata.data?.ayah_count ?? 6236} Ayahs`} />
        <Info label="License" value={metadata.data?.license ?? 'Creative Commons Attribution 3.0'} />
        <Text style={styles.footnote}>The Arabic database is physically separate from translations and opened in SQLite query-only mode. Tanzil text is distributed verbatim and cannot be edited here.</Text>
      </Section>

      <Section icon="lock-closed-outline" title="Privacy & storage">
        <Text style={styles.copy}>No account, analytics service, or app backend is used. Missing recitation audio is requested from EveryAyah only when you press play; imports, notes, highlights, downloads, and preferences stay inside the app sandbox.</Text>
        <Text style={styles.warning}>Uninstalling the app may remove local data. Create a Quran Folio backup before changing devices or uninstalling.</Text>
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
  preferenceLabel: { color: colors.gold, fontFamily: fontFamilies.bodyBold, fontSize: 10, letterSpacing: 1.3, marginTop: 18, paddingBottom: 5, textTransform: 'uppercase' },
  warning: { backgroundColor: '#F4E5D1', color: colors.oxblood, fontFamily: fontFamilies.body, fontSize: 16, lineHeight: 21, marginTop: 12, padding: 12 },
  ready: { color: colors.emerald, fontFamily: fontFamilies.bodyBold, fontSize: 14, marginTop: 14 },
  testButton: { marginTop: 16 },
  restoreButton: { marginTop: 10 },
  footnote: { color: colors.inkMuted, fontFamily: fontFamilies.displayItalic, fontSize: 15, lineHeight: 20, marginTop: 12 },
  info: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 9 },
  infoLabel: { color: colors.inkMuted, fontFamily: fontFamilies.bodyBold, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase' },
  infoValue: { color: colors.ink, fontFamily: fontFamilies.body, fontSize: 17, marginTop: 2 },
  attribution: { alignItems: 'center', marginTop: spacing.md, padding: spacing.md },
  attributionTitle: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 20 },
  attributionBody: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 14, lineHeight: 19, marginTop: 3, textAlign: 'center' },
});
