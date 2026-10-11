import { useState } from 'react';
import { Platform, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/theme';

export type LinePoint = { key: string; xLabel: string; value: number | null };

const PAD = { left: 26, right: 30, top: 10, bottom: 24 };
// SVG text doesn't inherit the UI font on web
const FONT = Platform.select({ web: 'system-ui, -apple-system, "Segoe UI", sans-serif', default: undefined });

/**
 * Single-series line over time. 2px line, a 10% area wash, a ringed end-dot with its value
 * printed beside it, hairline grid, and a tap/scrub crosshair that reports the selected index.
 * Days without data are gaps, never interpolated.
 */
export function LineChart({
  data,
  color,
  min = 0,
  max = 10,
  ticks = [0, 5, 10],
  height = 190,
  selected,
  onSelect,
  format = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1)),
}: {
  data: LinePoint[];
  color: string;
  min?: number;
  max?: number;
  ticks?: number[];
  height?: number;
  selected: number | null;
  onSelect: (index: number | null) => void;
  format?: (v: number) => string;
}) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const n = data.length;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (i * plotW) / (n - 1));
  const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * plotH;

  // Split into runs of consecutive days with data
  const runs: number[][] = [];
  let run: number[] = [];
  data.forEach((p, i) => {
    if (p.value == null) {
      if (run.length) runs.push(run);
      run = [];
    } else run.push(i);
  });
  if (run.length) runs.push(run);

  const linePath = (idx: number[]) => idx.map((i, k) => `${k ? 'L' : 'M'}${x(i)},${y(data[i].value!)}`).join(' ');
  const areaPath = (idx: number[]) =>
    `${linePath(idx)} L${x(idx[idx.length - 1])},${y(min)} L${x(idx[0])},${y(min)} Z`;

  const lastIndex = [...data.keys()].reverse().find((i) => data[i].value != null);
  const labelEvery = n <= 8 ? 1 : Math.ceil(n / 6);

  function pick(e: GestureResponderEvent) {
    if (n === 0 || plotW <= 0) return;
    const step = n <= 1 ? plotW : plotW / (n - 1);
    const i = Math.round((e.nativeEvent.locationX - PAD.left) / step);
    onSelect(Math.max(0, Math.min(n - 1, i)));
  }

  return (
    <View
      style={{ height }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={pick}
      onResponderMove={pick}
      onResponderTerminationRequest={() => true}
      accessibilityRole="adjustable"
      accessibilityLabel="Trend chart. Swipe up or down to step through days."
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const cur = selected ?? (lastIndex ?? n - 1);
        onSelect(Math.max(0, Math.min(n - 1, cur + (e.nativeEvent.actionName === 'increment' ? 1 : -1))));
      }}>
      {width > 0 && (
        <Svg width={width} height={height}>
          {ticks.map((tick) => (
            <Line key={tick} x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke={t.grid} strokeWidth={1} />
          ))}
          {ticks.map((tick) => (
            <SvgText key={`l${tick}`} x={PAD.left - 8} y={y(tick) + 4} fontSize={11} fill={t.axis} textAnchor="end" fontFamily={FONT}>
              {tick}
            </SvgText>
          ))}
          {data.map((p, i) =>
            i % labelEvery === 0 || i === n - 1 ? (
              <SvgText key={p.key} x={x(i)} y={height - 6} fontSize={11} fill={t.axis} textAnchor="middle" fontFamily={FONT}>
                {p.xLabel}
              </SvgText>
            ) : null,
          )}

          {runs.map((r) => (r.length > 1 ? <Path key={`a${r[0]}`} d={areaPath(r)} fill={color} opacity={0.1} /> : null))}
          {runs.map((r) =>
            r.length > 1 ? (
              <Path key={`p${r[0]}`} d={linePath(r)} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            ) : (
              <Circle key={`s${r[0]}`} cx={x(r[0])} cy={y(data[r[0]].value!)} r={3} fill={color} />
            ),
          )}

          {selected != null && (
            <Line x1={x(selected)} x2={x(selected)} y1={PAD.top} y2={y(min)} stroke={t.axis} strokeWidth={1} />
          )}
          {selected != null && data[selected]?.value != null && (
            <Circle cx={x(selected)} cy={y(data[selected].value!)} r={5} fill={color} stroke={t.card} strokeWidth={2} />
          )}

          {lastIndex != null && selected == null && (
            <>
              <Circle cx={x(lastIndex)} cy={y(data[lastIndex].value!)} r={5} fill={color} stroke={t.card} strokeWidth={2} />
              <SvgText
                x={x(lastIndex) + 9}
                y={y(data[lastIndex].value!) + 4}
                fontSize={12}
                fontWeight="600"
                fontFamily={FONT}
                fill={t.text}>
                {format(data[lastIndex].value!)}
              </SvgText>
            </>
          )}
        </Svg>
      )}
    </View>
  );
}

/** Tiny trend line for stat tiles: de-emphasised gray with the latest point in the accent. */
export function Sparkline({ values, color, width = 72, height = 26 }: { values: (number | null)[]; color: string; width?: number; height?: number }) {
  const t = useTheme();
  const present = values.map((v, i) => [i, v] as const).filter(([, v]) => v != null) as [number, number][];
  if (present.length < 2) return <View style={{ width, height }} />;
  const vs = present.map(([, v]) => v);
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const span = hi - lo || 1;
  const px = (i: number) => 3 + (i * (width - 6)) / Math.max(1, values.length - 1);
  const py = (v: number) => 3 + (1 - (v - lo) / span) * (height - 6);
  const d = present.map(([i, v], k) => `${k ? 'L' : 'M'}${px(i)},${py(v)}`).join(' ');
  const [li, lv] = present[present.length - 1];
  return (
    <Svg width={width} height={height}>
      <Path d={d} stroke={t.textTertiary} strokeWidth={1.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={px(li)} cy={py(lv)} r={3.5} fill={color} stroke={t.card} strokeWidth={1.5} />
    </Svg>
  );
}

