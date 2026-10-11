import { StyleSheet, View } from 'react-native';

import { Spacing, useTheme } from '@/theme';

import { Text } from '../ui/Text';

/**
 * Horizontal bars for one series: thin bars in one color, rounded at the data end,
 * square at the baseline, with the value printed at the tip in ink.
 */
export function BarList({
  rows,
  color,
  format = String,
}: {
  rows: { key: string; label: string; value: number; caption?: string }[];
  color: string;
  format?: (v: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <View style={{ gap: Spacing.md }}>
      {rows.map((r) => (
        <View key={r.key} accessible accessibilityLabel={`${r.label}: ${format(r.value)}`}>
          <View style={styles.labels}>
            <Text variant="subheadline" style={{ flex: 1 }} numberOfLines={1}>
              {r.label}
            </Text>
            {r.caption && (
              <Text variant="footnote" tone="secondary">
                {r.caption}
              </Text>
            )}
          </View>
          <View style={styles.barRow}>
            <View style={[styles.bar, { width: `${(r.value / max) * 82}%`, backgroundColor: color }]} />
            <Text variant="footnote" weight="600" style={styles.tip}>
              {format(r.value)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Diverging bars around zero: positive to the right in the cool pole, negative to the left in
 * the warm pole, neutral gray midline. Used for "how much each activity moves your mood".
 */
export function DivergingBars({
  rows,
  positiveColor,
  negativeColor,
  format,
}: {
  rows: { key: string; label: string; value: number; caption?: string }[];
  positiveColor: string;
  negativeColor: string;
  format: (v: number) => string;
}) {
  const t = useTheme();
  const extent = Math.max(0.5, ...rows.map((r) => Math.abs(r.value)));
  return (
    <View style={{ gap: Spacing.md }}>
      {rows.map((r) => {
        const pct = (Math.abs(r.value) / extent) * 40; // each arm can use 40% of the row
        const positive = r.value >= 0;
        return (
          <View key={r.key} accessible accessibilityLabel={`${r.label}: ${format(r.value)}`}>
            <View style={styles.labels}>
              <Text variant="subheadline" style={{ flex: 1 }} numberOfLines={1}>
                {r.label}
              </Text>
              {r.caption && (
                <Text variant="footnote" tone="secondary">
                  {r.caption}
                </Text>
              )}
            </View>
            <View style={styles.divergingRow}>
              <View style={[styles.half, { alignItems: 'flex-end' }]}>
                {!positive && (
                  <View style={styles.barRow}>
                    <Text variant="footnote" weight="600" style={styles.tipLeft}>
                      {format(r.value)}
                    </Text>
                    <View style={[styles.bar, styles.leftBar, { width: `${pct * 2}%`, backgroundColor: negativeColor }]} />
                  </View>
                )}
              </View>
              <View style={[styles.midline, { backgroundColor: t.axis }]} />
              <View style={styles.half}>
                {positive && (
                  <View style={styles.barRow}>
                    <View style={[styles.bar, { width: `${Math.max(pct * 2, 1)}%`, backgroundColor: positiveColor }]} />
                    <Text variant="footnote" weight="600" style={styles.tip}>
                      {format(r.value)}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  labels: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm, marginBottom: 6 },
  barRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  bar: { height: 10, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  leftBar: { borderTopRightRadius: 0, borderBottomRightRadius: 0, borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
  tip: { marginLeft: 8, fontVariant: ['tabular-nums'] },
  tipLeft: { marginRight: 8, fontVariant: ['tabular-nums'], marginLeft: 'auto' },
  divergingRow: { flexDirection: 'row', alignItems: 'center', height: 16 },
  half: { flex: 1, justifyContent: 'center' },
  midline: { width: 1, height: 16 },
});
