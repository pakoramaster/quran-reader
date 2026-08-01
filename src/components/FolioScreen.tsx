import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fontFamilies, spacing } from '@/theme/tokens';

interface FolioScreenProps extends PropsWithChildren {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  scroll?: boolean;
  action?: ReactNode;
  contentStyle?: ViewStyle;
  safeBottom?: boolean;
}

interface FolioHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function FolioHeader({ eyebrow, title, subtitle, action }: FolioHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.rule} />
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text> : null}
      <View style={styles.titleRow}>
        <View style={styles.titleCopy}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {action}
      </View>
    </View>
  );
}

export function FolioScreen({
  children,
  eyebrow,
  title,
  subtitle,
  scroll = true,
  action,
  contentStyle,
  safeBottom = false,
}: FolioScreenProps) {
  const header = title ? <FolioHeader action={action} eyebrow={eyebrow} subtitle={subtitle} title={title} /> : null;

  return (
    <SafeAreaView edges={safeBottom ? ['top', 'bottom', 'left', 'right'] : ['top', 'left', 'right']} style={styles.safeArea}>
      <View pointerEvents="none" style={styles.watermark}>
        <View style={styles.watermarkRing} />
        <View style={[styles.watermarkRing, styles.watermarkRingInner]} />
      </View>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.staticContent, contentStyle]}>
          {header}
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.paper, flex: 1 },
  scrollContent: {
    alignSelf: 'center',
    maxWidth: 1120,
    paddingBottom: 56,
    paddingHorizontal: spacing.lg,
    width: '100%',
  },
  staticContent: {
    alignSelf: 'center',
    flex: 1,
    maxWidth: 1120,
    paddingHorizontal: spacing.lg,
    width: '100%',
  },
  header: { paddingBottom: spacing.lg, paddingTop: spacing.md },
  rule: { backgroundColor: colors.gold, height: 2, marginBottom: 12, width: 42 },
  eyebrow: {
    color: colors.gold,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 12,
    letterSpacing: 2.2,
    marginBottom: 2,
  },
  titleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  titleCopy: { flex: 1, minWidth: 0 },
  title: {
    color: colors.ink,
    fontFamily: fontFamilies.display,
    fontSize: 30,
    flexShrink: 1,
    lineHeight: 40,
  },
  subtitle: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.body,
    fontSize: 18,
    lineHeight: 24,
    marginTop: 4,
    maxWidth: 560,
  },
  watermark: { height: 180, opacity: 0.35, position: 'absolute', right: -72, top: -54, width: 180 },
  watermarkRing: {
    borderColor: colors.goldLight,
    borderRadius: 90,
    borderWidth: 1,
    height: 180,
    position: 'absolute',
    width: 180,
  },
  watermarkRingInner: { height: 120, left: 30, top: 30, width: 120 },
});
