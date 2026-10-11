import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Text } from '../ui/Text';

/** Circular meter (0–100) with the number in the middle. Track is a wash of the same hue. */
export function Ring({ value, color, size = 120, stroke = 12 }: { value: number | null; color: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeOpacity={0.15} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c * pct} ${c}`}
          strokeLinecap="round"
        />
      </Svg>
      <Text variant="largeTitle" style={{ fontSize: size * 0.3, lineHeight: size * 0.36 }}>
        {value == null ? '–' : Math.round(value)}
      </Text>
    </View>
  );
}
