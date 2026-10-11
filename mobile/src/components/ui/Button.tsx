import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Spacing, useTheme } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

type Kind = 'primary' | 'secondary' | 'plain' | 'destructive';

export function haptic(style: 'light' | 'medium' | 'success' | 'warning' = 'light') {
  if (Platform.OS === 'web') return;
  if (style === 'success' || style === 'warning') {
    Haptics.notificationAsync(
      style === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
    );
  } else {
    Haptics.impactAsync(style === 'light' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
  }
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  loading,
  disabled,
  small,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: Kind;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = { primary: t.tint, secondary: t.fill, plain: 'transparent', destructive: t.fill }[kind];
  const fg = { primary: t.onTint, secondary: t.tint, plain: t.tint, destructive: t.destructive }[kind];
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={() => {
        haptic('light');
        onPress();
      }}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        small && styles.small,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon && <Icon name={icon} size={small ? 15 : 18} color={fg} weight="semibold" />}
          <Text variant={small ? 'subheadline' : 'headline'} weight="600" style={{ color: fg }}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  size = 20,
  tinted,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  size?: number;
  tinted?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: tinted ? t.tintSoft : t.fill, opacity: pressed ? 0.6 : 1 },
      ]}>
      <Icon name={icon} size={size} color={t.tint} weight="semibold" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: { minHeight: 36, borderRadius: Radius.pill, paddingHorizontal: Spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
