import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from '../ui/Text';

/**
 * A 1–10 score as a horizontal meter. The track is a light wash of the same hue,
 * so the scale reads across the whole bar; the value is always printed as text.
 */
export function Meter({ label, value, color, max = 10, suffix }: { label: string; value: number | null; color: string; max?: number; suffix?: string }) {
  const t = useTheme();
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value / max));
  return (
    <View style={styles.wrap} accessible accessibilityLabel={`${label}: ${value ?? 'not mentioned'}${value != null ? ` out of ${max}` : ''}`}>
      <View style={styles.labels}>
        <Text variant="subheadline">{label}</Text>
        <Text variant="subheadline" weight="600">
          {value == null ? '–' : `${value}${suffix ?? `/${max}`}`}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: value == null ? t.fill : `${color}26` }]}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});
