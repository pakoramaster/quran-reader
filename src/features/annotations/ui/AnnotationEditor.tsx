import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { memo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FolioButton } from '@/components/FolioButton';
import { FolioModal } from '@/platform/ui/FolioModal';
import { FolioTextInput } from '@/platform/ui/FolioTextInput';
import { colors, fontFamilies, spacing } from '@/theme/tokens';
import type { HighlightColor, ReaderAyah } from '@/types/domain';

const highlightColors: (HighlightColor | null)[] = [null, 'amber', 'sage', 'sky', 'rose'];

interface AnnotationEditorProps {
  ayah: ReaderAyah | null;
  visible: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (note: string | null, highlight: HighlightColor | null) => void;
}

export const AnnotationEditor = memo(function AnnotationEditor({ ayah, visible, saving, onClose, onSave }: AnnotationEditorProps) {
  const [note, setNote] = useState(() => ayah?.annotation?.noteText ?? '');
  const [highlight, setHighlight] = useState<HighlightColor | null>(() => ayah?.annotation?.highlightColor ?? null);

  if (!ayah) return null;
  return (
    <FolioModal onRequestClose={onClose} visible={visible}>
      <SafeAreaView
        edges={['bottom', 'left', 'right']}
        style={styles.safeArea}
        testID="annotation-editor-safe-area"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardAvoider}
        >
          <ScrollView
            contentContainerStyle={styles.container}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            testID="annotation-editor-scroll"
          >
            <View style={styles.topRule} />
            <Text style={styles.eyebrow}>REFLECTION · {ayah.verseKey}</Text>
            <Text numberOfLines={2} style={styles.arabic}>{ayah.textUthmani}</Text>
            <Text style={styles.label}>NOTE</Text>
            <FolioTextInput
              accessibilityLabel={`Note for verse ${ayah.verseKey}`}
              autoFocus
              maxLength={10_000}
              multiline
              onChangeText={setNote}
              placeholder="Write a private reflection…"
              placeholderTextColor={colors.inkMuted}
              style={styles.input}
              textAlignVertical="top"
              value={note}
            />
            <Text style={styles.label}>WHOLE-AYAH HIGHLIGHT</Text>
            <View style={styles.swatches}>
              {highlightColors.map((color) => (
                <Pressable
                  accessibilityLabel={color ? `${color} highlight` : 'No highlight color'}
                  accessibilityRole="button"
                  accessibilityState={{ selected: highlight === color }}
                  key={color ?? 'none'}
                  onPress={() => setHighlight(color)}
                  style={[
                    styles.swatch,
                    color ? { backgroundColor: colors.highlight[color] } : styles.noColorSwatch,
                    highlight === color ? styles.swatchSelected : null,
                  ]}
                >
                  {!color ? <View pointerEvents="none" style={styles.noColorSlash} /> : null}
                </Pressable>
              ))}
            </View>
            <View style={styles.actions} testID="annotation-editor-actions">
              <FolioButton label="Cancel" onPress={onClose} style={styles.action} variant="quiet" />
              <FolioButton
                label={note.trim() || highlight ? 'Save reflection' : 'Clear reflection'}
                loading={saving}
                onPress={() => onSave(note.trim() || null, highlight)}
                style={styles.action}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </FolioModal>
  );
});

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.paper, flex: 1 },
  keyboardAvoider: { flex: 1 },
  container: {
    backgroundColor: colors.paper,
    flexGrow: 1,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: 58,
  },
  topRule: { backgroundColor: colors.gold, height: 2, marginBottom: 14, width: 46 },
  eyebrow: { color: colors.gold, fontFamily: fontFamilies.bodyBold, fontSize: 12, letterSpacing: 1.8 },
  arabic: { color: colors.emerald, fontFamily: fontFamilies.arabic, fontSize: 26, lineHeight: 44, marginVertical: 16, textAlign: 'right', writingDirection: 'rtl' },
  label: { color: colors.inkMuted, fontFamily: fontFamilies.bodyBold, fontSize: 11, letterSpacing: 1.5, marginBottom: 8, marginTop: 16 },
  input: {
    backgroundColor: colors.paperLight,
    borderColor: colors.border,
    borderRadius: 3,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: fontFamilies.body,
    fontSize: 19,
    lineHeight: 26,
    minHeight: 180,
    padding: 16,
  },
  swatches: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  swatch: { borderColor: colors.paperLight, borderRadius: 22, borderWidth: 4, height: 44, width: 44 },
  noColorSwatch: { backgroundColor: 'transparent', borderColor: colors.border },
  noColorSlash: { backgroundColor: colors.oxblood, height: 2, left: 2, position: 'absolute', top: 17, transform: [{ rotate: '-45deg' }], width: 32 },
  swatchSelected: { borderColor: colors.emerald, transform: [{ scale: 1.08 }] },
  actions: { flexDirection: 'row', gap: 12, marginTop: spacing.lg },
  action: { flex: 1 },
});
