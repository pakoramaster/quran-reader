import { StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies, spacing } from '@/theme/tokens';
import { FolioButton } from './FolioButton';

interface EmptyFolioProps {
  glyph: string;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyFolio({ glyph, title, body, actionLabel, onAction }: EmptyFolioProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.glyph}>{glyph}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {actionLabel && onAction ? <FolioButton label={actionLabel} onPress={onAction} style={styles.button} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: colors.paperLight,
    borderColor: colors.border,
    borderRadius: 4,
    borderWidth: 1,
    marginTop: spacing.lg,
    padding: spacing.xl,
  },
  glyph: { color: colors.gold, fontFamily: fontFamilies.display, fontSize: 42 },
  title: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 27, marginTop: 8, textAlign: 'center' },
  body: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 18, lineHeight: 24, marginTop: 6, textAlign: 'center' },
  button: { marginTop: spacing.lg, minWidth: 180 },
});
