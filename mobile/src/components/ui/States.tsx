import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, View, type DimensionValue } from 'react-native';

import { Radius, Spacing, useTheme } from '@/theme';

import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: IconName;
  title: string;
  message: string;
  action?: { title: string; onPress: () => void };
}) {
  const t = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: t.tintSoft }]}>
        <Icon name={icon} size={28} color={t.tint} />
      </View>
      <Text variant="title3" align="center">
        {title}
      </Text>
      <Text variant="subheadline" tone="secondary" align="center" style={{ maxWidth: 300 }}>
        {message}
      </Text>
      {action && <Button title={action.title} onPress={action.onPress} small style={{ marginTop: Spacing.sm }} />}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon={{ ios: 'exclamationmark.triangle', android: 'warning' }}
      title="Couldn't load this"
      message={message}
      action={onRetry ? { title: 'Try again', onPress: onRetry } : undefined}
    />
  );
}

export function Loading() {
  const t = useTheme();
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={t.textSecondary} />
    </View>
  );
}

/** A softly pulsing placeholder bar. */
export function Skeleton({ width = '100%', height = 14, style }: { width?: DimensionValue; height?: number; style?: object }) {
  const t = useTheme();
  const [opacity] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[{ width, height, borderRadius: 6, backgroundColor: t.fill, opacity }, style]} />;
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xxxl, paddingHorizontal: Spacing.xl },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  loading: { paddingVertical: Spacing.xxxl, alignItems: 'center' },
});
