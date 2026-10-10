import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { lastNDays, parseISODate, toISODate } from '@/lib/dates';
import { Radius, Spacing, useTheme } from '@/theme';

import { haptic } from './ui/Button';
import { Text } from './ui/Text';

/** Horizontal strip of the last two weeks for choosing which day an entry is about. */
export function DayStrip({ value, onChange, days = 14 }: { value: string; onChange: (iso: string) => void; days?: number }) {
  const t = useTheme();
  const scroller = useRef<ScrollView>(null);
  const today = toISODate();
  const items = lastNDays(days).map(toISODate);

  useEffect(() => {
    const id = setTimeout(() => scroller.current?.scrollToEnd({ animated: false }), 0);
    return () => clearTimeout(id);
  }, []);

  return (
    <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {items.map((iso) => {
        const d = parseISODate(iso);
        const selected = iso === value;
        return (
          <Pressable
            key={iso}
            onPress={() => {
              haptic('light');
              onChange(iso);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
            style={[styles.day, { backgroundColor: selected ? t.tint : t.card }]}>
            <Text variant="caption2" style={{ color: selected ? t.onTint : t.textSecondary }}>
              {d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}
            </Text>
            <Text variant="headline" style={{ color: selected ? t.onTint : t.text }}>
              {d.getDate()}
            </Text>
            <View style={[styles.todayDot, { backgroundColor: iso === today ? (selected ? t.onTint : t.tint) : 'transparent' }]} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.sm, paddingVertical: 2 },
  day: { width: 48, paddingVertical: Spacing.sm, borderRadius: Radius.md, alignItems: 'center', gap: 2 },
  todayDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
});
