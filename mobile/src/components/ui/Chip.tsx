import { Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing, useTheme } from '@/theme';

import { Text } from './Text';

export function Chip({
  label,
  selected,
  onPress,
  dotColor,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  dotColor?: string;
}) {
  const t = useTheme();
  const content = (
    <View style={styles.row}>
      {dotColor && <View style={[styles.dot, { backgroundColor: dotColor }]} />}
      <Text variant="subheadline" weight={selected ? '600' : '500'} style={{ color: selected ? t.onTint : t.text }}>
        {label}
      </Text>
    </View>
  );
  const style = [styles.chip, { backgroundColor: selected ? t.tint : t.fill }];
  if (!onPress) return <View style={style}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [...style, pressed && { opacity: 0.7 }]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: Radius.pill, paddingHorizontal: Spacing.md, paddingVertical: 7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
