import { Platform, useColorScheme } from 'react-native';

/**
 * Apple system colors (iOS Human Interface Guidelines), so the app feels native on iPhone
 * and calm and consistent on Android.
 */
const light = {
  background: '#F2F2F7', // systemGroupedBackground
  card: '#FFFFFF', // secondarySystemGroupedBackground
  cardPressed: '#E5E5EA',
  elevated: '#FFFFFF',
  fill: 'rgba(118,118,128,0.12)', // tertiarySystemFill: chips, inputs
  fillStrong: 'rgba(118,118,128,0.2)',
  text: '#000000',
  textSecondary: 'rgba(60,60,67,0.6)',
  textTertiary: 'rgba(60,60,67,0.3)',
  separator: 'rgba(60,60,67,0.18)',
  tint: '#5856D6', // systemIndigo
  tintSoft: 'rgba(88,86,214,0.12)',
  onTint: '#FFFFFF',
  bubbleUser: '#5856D6',
  bubbleAssistant: '#FFFFFF',
  destructive: '#FF3B30',
  success: '#248A3D',
  warning: '#C93400',
  // Chart chrome
  grid: '#E5E5EA',
  axis: '#8E8E93',
};

const dark: typeof light = {
  background: '#000000',
  card: '#1C1C1E',
  cardPressed: '#2C2C2E',
  elevated: '#2C2C2E',
  fill: 'rgba(118,118,128,0.24)',
  fillStrong: 'rgba(118,118,128,0.36)',
  text: '#FFFFFF',
  textSecondary: 'rgba(235,235,245,0.6)',
  textTertiary: 'rgba(235,235,245,0.3)',
  separator: 'rgba(84,84,88,0.65)',
  tint: '#7D7AFF',
  tintSoft: 'rgba(125,122,255,0.18)',
  onTint: '#FFFFFF',
  bubbleUser: '#5E5CE6',
  bubbleAssistant: '#1C1C1E',
  destructive: '#FF453A',
  success: '#30D158',
  warning: '#FF9F0A',
  grid: '#2C2C2E',
  axis: '#8E8E93',
};

export type Palette = typeof light;
export const Colors = { light, dark };

/** Gradient behind the record orb and brand marks. */
export const OrbGradient = {
  light: ['#7F7CFF', '#5856D6', '#AF52DE'] as const,
  dark: ['#8E8BFF', '#5E5CE6', '#BF5AF2'] as const,
};

/** iOS text styles (size / line height / weight). */
export const Type = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '600' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 24, fontWeight: '400' },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400' },
  subheadline: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  caption2: { fontSize: 11, lineHeight: 13, fontWeight: '500' },
} as const;

export type TypeVariant = keyof typeof Type;

export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 } as const;
export const Radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

/** Space the floating tab bar covers at the bottom of every tab screen. */
export const BottomTabInset = Platform.select({ ios: 50, android: 80, web: 60 }) ?? 0;
export const MaxContentWidth = 720;

export function useTheme(): Palette & { scheme: 'light' | 'dark' } {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { ...Colors[scheme], scheme };
}
