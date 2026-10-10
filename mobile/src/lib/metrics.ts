import type { IconName } from '@/components/ui/Icon';

import type { Scores } from './types';

export type MetricKey = 'mood' | 'energy' | 'productivity' | 'stress' | 'anxiety' | 'social_connection' | 'sleep_quality';

export type MetricDef = {
  key: MetricKey;
  label: string;
  short: string;
  /** Whether a higher value is good (stress and anxiety are better when lower). */
  higherIsBetter: boolean;
  /** Categorical slot colors, validated for colorblind separation on both card surfaces. */
  color: { light: string; dark: string };
  icon: IconName;
};

export const METRICS: MetricDef[] = [
  { key: 'mood', label: 'Mood', short: 'Mood', higherIsBetter: true, color: { light: '#2a78d6', dark: '#3987e5' }, icon: { ios: 'face.smiling', android: 'sentiment_satisfied' } },
  { key: 'energy', label: 'Energy', short: 'Energy', higherIsBetter: true, color: { light: '#eb6834', dark: '#d95926' }, icon: { ios: 'bolt.fill', android: 'bolt' } },
  { key: 'productivity', label: 'Efficiency', short: 'Efficiency', higherIsBetter: true, color: { light: '#1baf7a', dark: '#199e70' }, icon: { ios: 'checkmark.circle.fill', android: 'check_circle' } },
  { key: 'stress', label: 'Stress', short: 'Stress', higherIsBetter: false, color: { light: '#eda100', dark: '#c98500' }, icon: { ios: 'waveform.path.ecg', android: 'monitoring' } },
  { key: 'anxiety', label: 'Anxiety', short: 'Anxiety', higherIsBetter: false, color: { light: '#e87ba4', dark: '#d55181' }, icon: { ios: 'cloud.rain.fill', android: 'psychology' } },
  { key: 'social_connection', label: 'Connection', short: 'Connection', higherIsBetter: true, color: { light: '#008300', dark: '#008300' }, icon: { ios: 'person.2.fill', android: 'group' } },
  { key: 'sleep_quality', label: 'Sleep', short: 'Sleep', higherIsBetter: true, color: { light: '#6250d6', dark: '#9085e9' }, icon: { ios: 'moon.zzz.fill', android: 'bedtime' } },
];

export const METRIC = Object.fromEntries(METRICS.map((m) => [m.key, m])) as Record<MetricKey, MetricDef>;

export function metricColor(key: MetricKey, scheme: 'light' | 'dark') {
  return METRIC[key].color[scheme];
}

export function scoreOf(scores: Scores, key: MetricKey): number | null {
  return scores[key] ?? null;
}

/** Hue for a mood value: soft red (low) → amber → green (high). Used for small mood dots. */
export function moodTint(mood: number | null | undefined, scheme: 'light' | 'dark') {
  if (mood == null) return scheme === 'dark' ? '#636366' : '#C7C7CC';
  if (mood >= 8) return scheme === 'dark' ? '#30D158' : '#34C759';
  if (mood >= 6) return scheme === 'dark' ? '#64D2FF' : '#32ADE6';
  if (mood >= 4) return scheme === 'dark' ? '#FFD60A' : '#FFCC00';
  return scheme === 'dark' ? '#FF9F0A' : '#FF9500';
}

export function formatScore(v: number | null | undefined, digits = 1) {
  if (v == null) return '–';
  return Number.isInteger(v) ? String(v) : v.toFixed(digits);
}
