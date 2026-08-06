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
import { DEFAULT_READING_FONT_SIZE_ID, isReadingFontSizeId, READING_FONT_SIZES } from '@/features/settings/domain/readingFontSizes';
import { useSpeech } from '@/features/speech/application/SpeechProvider';
import { listSystemVoices } from '@/features/speech/data/systemTtsEngine';
import { ensureUniformVoiceModel } from '@/features/speech/data/uniformTtsEngine';
import { DEFAULT_SPEECH_ENGINE_ID, isSpeechEngineId, SPEECH_ENGINES, type SpeechEngineId } from '@/features/speech/domain/speechEngines';
import { DEFAULT_SYSTEM_VOICE_ID, getSystemSpeechRate } from '@/features/speech/domain/systemVoices';
import { DEFAULT_VOICE_PROFILE_ID, isVoiceProfileId, VOICE_PROFILES, type VoiceProfileId } from '@/features/speech/domain/voiceProfiles';
import { DEFAULT_TTS_SPEED_ID, getTtsSpeed, isTtsSpeedId, SYSTEM_TTS_SPEEDS, TTS_SPEEDS, type TtsSpeedId } from '@/features/speech/domain/ttsSpeeds';
import { getActiveTranslationId, getTranslation } from '@/features/translations/data/translationRepository';
import { pickBackupFile, saveBackupFile } from '@/platform/backups/backupFiles';
import { requestConfirmation, showMessage } from '@/platform/dialogs/dialogs';
import { colors, fontFamilies, spacing } from '@/theme/tokens';

export default function SettingsScreen() {
  const quranDb = useSQLiteContext();
  const userDb = useUserDatabase();
  const queryClient = useQueryClient();
  const speech = useSpeech();
  const [testingVoice, setTestingVoice] = useState(false);
  const [speechDraft, setSpeechDraft] = useState<{
    language: string;
    engineId: SpeechEngineId;
    profileId: VoiceProfileId;
    speedId: TtsSpeedId;
    systemVoiceId: string;
  } | null>(null);
  const metadata = useQuery({
    queryKey: ['quran-metadata'],
    queryFn: () => getQuranMetadata(quranDb),
    staleTime: Infinity,
  });
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
      engine: await getSetting(userDb, 'tts_engine'),
      systemVoice: await getSetting(userDb, 'tts_system_voice'),
    }),
    enabled: Boolean(activeTranslation.data?.language),
  });
  const readingFontSize = useQuery({
    queryKey: ['reading-font-size'],
    queryFn: () => getSetting(userDb, 'reading_font_size'),
  });
  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => setSetting(userDb, key, value),
    onSuccess: async (_result, variables) => {
      if (variables.key === 'reading_font_size') {
        await queryClient.invalidateQueries({
          queryKey: ['reading-font-size'],
        });
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['speech-settings'] }),
        queryClient.invalidateQueries({
          queryKey: ['recitation-player-settings'],
        }),
      ]);
    },
  });
  const systemVoices = useQuery({
    queryKey: ['system-voices', activeTranslation.data?.language],
    queryFn: () => listSystemVoices(activeTranslation.data!.language),
    enabled: Boolean(activeTranslation.data?.language),
    staleTime: Infinity,
  });
  const saveSpeechSettings = useMutation({
    mutationFn: async ({ engineId, profileId, speedId, systemVoiceId }: { engineId: SpeechEngineId; profileId: VoiceProfileId; speedId: TtsSpeedId; systemVoiceId: string }) => {
      await speech.stop();
      await setSetting(userDb, 'tts_engine', engineId);
      await setSetting(userDb, 'tts_system_voice', systemVoiceId);
      await setSetting(userDb, 'tts_voice_profile', profileId);
      await setSetting(userDb, 'tts_speed', speedId);
    },
    onError: (error) => showMessage(
      'Speaker settings could not be saved',
      error instanceof Error ? error.message : 'The selected speaker settings could not be saved.',
    ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['speech-settings'] }),
        queryClient.invalidateQueries({ queryKey: ['recitation-player-settings'] }),
      ]);
      showMessage('Speaker settings saved', 'Your selected voice and translation speech speed are now used for read aloud.');
    },
  });
  const backup = useMutation({
    mutationFn: async () => {
      const archive = await createBackupArchive(userDb);
      const date = new Date(archive.summary.createdAt).toISOString().slice(0, 10);
      const saved = await saveBackupFile(archive.bytes, `quran-folio-backup-${date}.quranfolio`);
      return { saved, summary: archive.summary };
    },
    onError: (error) => showMessage('Backup could not be created', error instanceof Error ? error.message : 'The backup failed.'),
    onSuccess: ({ saved }) => {
      if (saved) showMessage('Backup saved', 'Your Quran Folio backup was saved successfully.');
    },
  });
  const restore = useMutation({
    mutationFn: async (bytes: Uint8Array) => {
      await speech.stop();
      return restoreBackupArchive(userDb, bytes);
    },
    onError: (error) => showMessage('Backup could not be restored', error instanceof Error ? error.message : 'The restore failed.'),
    onSuccess: async (summary) => {
      await queryClient.invalidateQueries();
      showMessage(
        'Backup restored',
        `${summary.translationCount} translations, ${summary.annotationCount} notes or highlights, and ${summary.downloadedSurahCount} downloaded recitations were restored.`,
      );
    },
  });
  const chooseBackupToRestore = async () => {
    try {
      const bytes = await pickBackupFile();
      if (!bytes) return;
      const { summary } = inspectBackupArchive(bytes);
      requestConfirmation({
        title: 'Restore items from this backup?',
        message: `Created ${new Date(summary.createdAt).toLocaleString()}. It contains ${summary.translationCount} translations, ${summary.annotationCount} notes or highlights, and ${summary.downloadedSurahCount} downloaded recitations. Matching items will be updated; other local data and preferences will stay unchanged.`,
        confirmLabel: 'Restore backup',
        onConfirm: () => restore.mutate(bytes),
      });
    } catch (error) {
      showMessage('Backup could not be opened', error instanceof Error ? error.message : 'The selected file is invalid.');
    }
  };

  const storedProfileId = isVoiceProfileId(speechSettings.data?.profile) ? speechSettings.data.profile : DEFAULT_VOICE_PROFILE_ID;
  const storedSpeedId = isTtsSpeedId(speechSettings.data?.speed) ? speechSettings.data.speed : DEFAULT_TTS_SPEED_ID;
  const storedEngineId = isSpeechEngineId(speechSettings.data?.engine) ? speechSettings.data.engine : DEFAULT_SPEECH_ENGINE_ID;
  const storedSystemVoiceId = speechSettings.data?.systemVoice || DEFAULT_SYSTEM_VOICE_ID;
  const currentLanguage = activeTranslation.data?.language ?? '';
  const currentDraft = speechDraft?.language === currentLanguage ? speechDraft : null;
  const selectedProfileId = currentDraft?.profileId ?? storedProfileId;
  const selectedSpeedId = currentDraft?.speedId ?? storedSpeedId;
  const selectedEngineId = currentDraft?.engineId ?? storedEngineId;
  const availableSystemVoiceIds = new Set(systemVoices.data?.map((voice) => voice.identifier));
  const validStoredSystemVoiceId = systemVoices.data && storedSystemVoiceId !== DEFAULT_SYSTEM_VOICE_ID && !availableSystemVoiceIds.has(storedSystemVoiceId) ? DEFAULT_SYSTEM_VOICE_ID : storedSystemVoiceId;
  const selectedSystemVoiceId = currentDraft?.systemVoiceId ?? validStoredSystemVoiceId;
  const selectedSpeed = getTtsSpeed(selectedSpeedId);
  const speechSettingsChanged = selectedEngineId !== storedEngineId || selectedProfileId !== storedProfileId || selectedSpeedId !== storedSpeedId || selectedSystemVoiceId !== storedSystemVoiceId;
  const selectedReadingFontSize = isReadingFontSizeId(readingFontSize.data) ? readingFontSize.data : DEFAULT_READING_FONT_SIZE_ID;
  const stopForSpeechSettingsChange = () => {
    if (speech.status !== 'idle') void speech.stop();
  };
  const selectVoiceProfile = (profileId: VoiceProfileId) => {
    stopForSpeechSettingsChange();
    setSpeechDraft({ engineId: selectedEngineId, language: currentLanguage, profileId, speedId: selectedSpeedId, systemVoiceId: selectedSystemVoiceId });
  };
  const selectSpeechSpeed = (speedId: TtsSpeedId) => {
    stopForSpeechSettingsChange();
    setSpeechDraft({ engineId: selectedEngineId, language: currentLanguage, profileId: selectedProfileId, speedId, systemVoiceId: selectedSystemVoiceId });
  };
  const selectSpeechEngine = (engineId: SpeechEngineId) => {
    stopForSpeechSettingsChange();
    const speedId = engineId === 'kokoro' && !TTS_SPEEDS.some((speed) => speed.id === selectedSpeedId) ? DEFAULT_TTS_SPEED_ID : selectedSpeedId;
    setSpeechDraft({ engineId, language: currentLanguage, profileId: selectedProfileId, speedId, systemVoiceId: selectedSystemVoiceId });
  };
  const selectSystemVoice = (systemVoiceId: string) => {
    stopForSpeechSettingsChange();
    setSpeechDraft({ engineId: selectedEngineId, language: currentLanguage, profileId: selectedProfileId, speedId: selectedSpeedId, systemVoiceId });
  };
  const testCurrentVoice = async () => {
    setTestingVoice(true);
    try {
      if (selectedEngineId === 'kokoro') await ensureUniformVoiceModel();
      speech.speakAyah(
        { key: '1:1', text: 'This translation is ready for offline reading.' },
        activeTranslation.data?.language ?? 'en',
        selectedEngineId,
        selectedSystemVoiceId,
        selectedProfileId,
        selectedSpeed.value,
        1,
      );
    } catch (error) {
      showMessage('Voice could not be prepared', error instanceof Error ? error.message : 'The standard voice pack is unavailable.');
    } finally {
      setTestingVoice(false);
    }
  };

  return (
    <FolioScreen eyebrow="Reading room preferences" subtitle="Choose consistent Kokoro voices or a faster voice installed on this device." title="Settings">
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
            <Text style={styles.copy}>
              Voice for {activeTranslation.data.title} ({activeTranslation.data.language}). Both options run privately on this device.
            </Text>
            <Text style={styles.preferenceLabel}>Speech engine</Text>
            {SPEECH_ENGINES.map((engine) => {
              const selected = selectedEngineId === engine.id;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={engine.id}
                  onPress={() => selectSpeechEngine(engine.id)}
                  style={[styles.optionRow, selected ? styles.optionSelected : null]}
                >
                  <View style={styles.optionCopy}>
                    <Text style={styles.optionTitle}>{engine.name}</Text>
                    <Text style={styles.optionMeta}>{engine.description}</Text>
                  </View>
                  {selected ? <Ionicons color={colors.emerald} name="checkmark-circle" size={21} /> : null}
                </Pressable>
              );
            })}
            {selectedEngineId === 'kokoro' ? (
              <>
                <Text style={styles.preferenceLabel}>Kokoro voice</Text>
                {VOICE_PROFILES.map((profile) => {
                  const selected = selectedProfileId === profile.id;
                  return (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      key={profile.id}
                      onPress={() => selectVoiceProfile(profile.id)}
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
              </>
            ) : (
              <>
                <Text style={styles.preferenceLabel}>Device voice</Text>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selectedSystemVoiceId === DEFAULT_SYSTEM_VOICE_ID }}
                  onPress={() => selectSystemVoice(DEFAULT_SYSTEM_VOICE_ID)}
                  style={[styles.optionRow, selectedSystemVoiceId === DEFAULT_SYSTEM_VOICE_ID ? styles.optionSelected : null]}
                >
                  <View style={styles.optionCopy}>
                    <Text style={styles.optionTitle}>System default</Text>
                    <Text style={styles.optionMeta}>Let the operating system choose a voice for {activeTranslation.data.language}.</Text>
                  </View>
                  {selectedSystemVoiceId === DEFAULT_SYSTEM_VOICE_ID ? <Ionicons color={colors.emerald} name="checkmark-circle" size={21} /> : null}
                </Pressable>
                {systemVoices.data?.map((voice) => {
                  const selected = selectedSystemVoiceId === voice.identifier;
                  return (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      key={voice.identifier}
                      onPress={() => selectSystemVoice(voice.identifier)}
                      style={[styles.optionRow, selected ? styles.optionSelected : null]}
                    >
                      <View style={styles.optionCopy}>
                        <Text style={styles.optionTitle}>{voice.name}</Text>
                        <Text style={styles.optionMeta}>{voice.language}{voice.quality === 'Enhanced' ? ' · Enhanced' : ''}</Text>
                      </View>
                      {selected ? <Ionicons color={colors.emerald} name="checkmark-circle" size={21} /> : null}
                    </Pressable>
                  );
                })}
                {systemVoices.isLoading ? <Text style={styles.optionMeta}>Finding installed voices…</Text> : null}
                {systemVoices.isError ? <Text style={styles.optionMeta}>Installed voices could not be listed. The system default remains available.</Text> : null}
              </>
            )}
            <Text style={styles.preferenceLabel}>Translation speech speed</Text>
            {(selectedEngineId === 'system' ? SYSTEM_TTS_SPEEDS : TTS_SPEEDS).map((speed) => {
              const selected = selectedSpeedId === speed.id;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={speed.id}
                  onPress={() => selectSpeechSpeed(speed.id)}
                  style={[styles.optionRow, selected ? styles.optionSelected : null]}
                >
                  <View style={styles.optionCopy}>
                    <Text style={styles.optionTitle}>{speed.label}</Text>
                    <Text style={styles.optionMeta}>{selectedEngineId === 'system' ? `${getSystemSpeechRate(speed.value)}× device speed` : speed.description}</Text>
                  </View>
                  {selected ? <Ionicons color={colors.emerald} name="checkmark-circle" size={21} /> : null}
                </Pressable>
              );
            })}
            <Text style={styles.ready}>{selectedEngineId === 'kokoro' ? 'Kokoro voice pack included for offline use' : 'Using an installed operating-system voice'}</Text>
            <FolioButton label="Test current voice" loading={testingVoice} onPress={() => void testCurrentVoice()} style={styles.testButton} variant="secondary" />
            <FolioButton
              disabled={!speechSettings.data || !speechSettingsChanged}
              label="Save speaker settings"
              loading={saveSpeechSettings.isPending}
              onPress={() => saveSpeechSettings.mutate({ engineId: selectedEngineId, profileId: selectedProfileId, speedId: selectedSpeedId, systemVoiceId: selectedSystemVoiceId })}
              style={styles.saveSpeakerButton}
            />
            <Text style={styles.footnote}>
              Kokoro provides the same four English voices on every platform. Device voice uses the selected language with an installed Android, Apple, or Windows speech engine; its sound and offline
              availability depend on the voices installed on that device.
            </Text>
          </>
        ) : (
          <Text style={styles.copy}>Import a translation before choosing its read-aloud voice.</Text>
        )}
      </Section>

      <Section icon="download-outline" title="Offline recitation">
        <Text style={styles.copy}>Download individual Surahs for either reciter. The player uses saved MP3 files automatically and only streams missing verses.</Text>
        <FolioButton label="Manage recitation downloads" onPress={() => router.push('/downloads')} style={styles.testButton} variant="secondary" />
      </Section>

      <Section icon="archive-outline" title="Backup & restore">
        <Text style={styles.copy}>Create one portable file containing imported translations, notes, highlights, preferences, and every downloaded recitation MP3.</Text>
        <FolioButton label="Create backup" loading={backup.isPending} onPress={() => backup.mutate()} style={styles.testButton} />
        <FolioButton label="Restore from backup" loading={restore.isPending} onPress={() => void chooseBackupToRestore()} style={styles.restoreButton} variant="secondary" />
        <Text style={styles.footnote}>
          Restoring updates matching backup items and keeps other local data and current preferences unchanged. The verified Arabic Quran database is bundled with the app and is not duplicated in backups.
        </Text>
      </Section>

      <Section icon="shield-checkmark-outline" title="Arabic text integrity">
        <Info label="Source" value={metadata.data?.source_name ?? 'Tanzil Project'} />
        <Info label="Edition" value={metadata.data?.source_version ?? 'Uthmani 1.1'} />
        <Info label="Coverage" value={`${metadata.data?.surah_count ?? 114} Surahs · ${metadata.data?.ayah_count ?? 6236} Ayahs`} />
        <Info label="License" value={metadata.data?.license ?? 'Creative Commons Attribution 3.0'} />
        <Text style={styles.footnote}>
          The Arabic database is physically separate from translations and opened in SQLite query-only mode. Tanzil text is distributed verbatim and cannot be edited here.
        </Text>
      </Section>

      <Section icon="lock-closed-outline" title="Privacy & storage">
        <Text style={styles.copy}>
          No account, analytics service, or app backend is used. Missing recitation audio is requested from EveryAyah only when you press play; imports, notes, highlights, downloads, and preferences
          stay inside the app sandbox.
        </Text>
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
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Ionicons color={colors.gold} name={icon} size={22} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.info}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.paperLight,
    borderColor: colors.border,
    borderRadius: 3,
    borderWidth: 1,
    marginBottom: 16,
    padding: 18,
  },
  sectionHeading: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
    paddingBottom: 12,
  },
  sectionTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.display,
    fontSize: 25,
  },
  copy: {
    color: colors.ink,
    fontFamily: fontFamilies.body,
    fontSize: 17,
    lineHeight: 23,
  },
  optionRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingVertical: 10,
  },
  optionSelected: {
    backgroundColor: colors.emeraldLight,
    marginHorizontal: -8,
    paddingHorizontal: 8,
  },
  optionCopy: { flex: 1 },
  optionTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 16,
  },
  optionMeta: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.body,
    fontSize: 14,
  },
  preferenceLabel: {
    color: colors.gold,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 10,
    letterSpacing: 1.3,
    marginTop: 18,
    paddingBottom: 5,
    textTransform: 'uppercase',
  },
  warning: {
    backgroundColor: '#F4E5D1',
    color: colors.oxblood,
    fontFamily: fontFamilies.body,
    fontSize: 16,
    lineHeight: 21,
    marginTop: 12,
    padding: 12,
  },
  ready: {
    color: colors.emerald,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 14,
    marginTop: 14,
  },
  testButton: { marginTop: 16 },
  saveSpeakerButton: { marginTop: 10 },
  restoreButton: { marginTop: 10 },
  footnote: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.displayItalic,
    fontSize: 15,
    lineHeight: 20,
    marginTop: 12,
  },
  info: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 9,
  },
  infoLabel: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  infoValue: {
    color: colors.ink,
    fontFamily: fontFamilies.body,
    fontSize: 17,
    marginTop: 2,
  },
  attribution: {
    alignItems: 'center',
    marginTop: spacing.md,
    padding: spacing.md,
  },
  attributionTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.display,
    fontSize: 20,
  },
  attributionBody: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.body,
    fontSize: 14,
    lineHeight: 19,
    marginTop: 3,
    textAlign: 'center',
  },
});
