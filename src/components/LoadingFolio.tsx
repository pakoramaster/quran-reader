import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamilies } from '@/theme/tokens';

export function LoadingFolio({ label = 'Opening the folio…' }: { label?: string }) {
  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.gold} size="large" />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center', padding: 32 },
  label: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 18 },
});
