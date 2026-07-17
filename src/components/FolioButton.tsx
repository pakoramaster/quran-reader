import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import { colors, fontFamilies } from '@/theme/tokens';

interface FolioButtonProps extends PressableProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'quiet';
  loading?: boolean;
}

export function FolioButton({ label, variant = 'primary', loading, disabled, style, ...props }: FolioButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={(state) => [
        styles.base,
        styles[variant],
        state.pressed ? styles.pressed : null,
        disabled || loading ? styles.disabled : null,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.paperLight : colors.emerald} />
      ) : (
        <Text style={[styles.label, variant === 'primary' ? styles.primaryLabel : styles.secondaryLabel]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: 3,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 20,
  },
  primary: { backgroundColor: colors.emerald },
  secondary: { backgroundColor: colors.paperLight, borderColor: colors.emerald, borderWidth: 1 },
  quiet: { backgroundColor: 'transparent', borderColor: colors.border, borderWidth: 1 },
  pressed: { opacity: 0.72, transform: [{ translateY: 1 }] },
  disabled: { opacity: 0.45 },
  label: { fontFamily: fontFamilies.bodyBold, fontSize: 17, letterSpacing: 0.2 },
  primaryLabel: { color: colors.paperLight },
  secondaryLabel: { color: colors.emerald },
});
