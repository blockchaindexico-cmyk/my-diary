import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { haptic } from './Button';
import { Text } from './Text';

/** iOS-style segmented control. */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const t = useTheme();
  return (
    <View style={[styles.track, { backgroundColor: t.fill }]} accessibilityRole="tablist">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => {
              if (!selected) haptic('light');
              onChange(o.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && [styles.selected, { backgroundColor: t.scheme === 'dark' ? '#636366' : '#FFFFFF' }]]}>
            <Text variant="footnote" weight={selected ? '600' : '500'}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: 9, padding: 2 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 7, marginHorizontal: 1 },
  selected: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
});
