import { Text as RNText, type TextProps } from 'react-native';

import { Type, useTheme, type TypeVariant } from '@/theme';

type Tone = 'primary' | 'secondary' | 'tertiary' | 'tint' | 'destructive' | 'onTint';

export function Text({
  variant = 'body',
  tone = 'primary',
  weight,
  align,
  style,
  ...rest
}: TextProps & {
  variant?: TypeVariant;
  tone?: Tone;
  weight?: '400' | '500' | '600' | '700' | '800';
  align?: 'left' | 'center' | 'right';
}) {
  const t = useTheme();
  const color = {
    primary: t.text,
    secondary: t.textSecondary,
    tertiary: t.textTertiary,
    tint: t.tint,
    destructive: t.destructive,
    onTint: t.onTint,
  }[tone];
  return (
    <RNText
      style={[Type[variant], { color }, weight && { fontWeight: weight }, align && { textAlign: align }, style]}
      {...rest}
    />
  );
}
