import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { formatDuration, timeOfDay } from '@/lib/dates';
import { moodTint } from '@/lib/metrics';
import type { Entry } from '@/lib/types';
import { Spacing, useTheme } from '@/theme';

import { Card } from './ui/Card';
import { Icon } from './ui/Icon';
import { Text } from './ui/Text';

export function MoodBadge({ mood, size = 44 }: { mood: number | null | undefined; size?: number }) {
  const t = useTheme();
  const color = moodTint(mood, t.scheme);
  return (
    <View
      style={[styles.badge, { width: size, height: size, borderRadius: size / 2, borderColor: color }]}
      accessibilityLabel={mood != null ? `Mood ${mood} out of 10` : 'Mood not analyzed yet'}>
      <Text variant="headline" weight="700">
        {mood ?? '·'}
      </Text>
    </View>
  );
}

export function EntryCard({ entry }: { entry: Entry }) {
  const t = useTheme();
  const a = entry.analysis;
  const meta = [
    timeOfDay(entry.created_at),
    entry.source === 'voice' && entry.duration_seconds ? `${formatDuration(entry.duration_seconds)} voice note` : null,
    a?.mood_label,
  ].filter(Boolean);

  return (
    <Card onPress={() => router.push({ pathname: '/entry/[id]', params: { id: String(entry.id) } })} style={styles.card}>
      <View style={styles.row}>
        <MoodBadge mood={a?.scores.mood} />
        <View style={{ flex: 1, gap: 2 }}>
          {entry.status === 'processing' ? (
            <View style={styles.inline}>
              <ActivityIndicator size="small" color={t.textSecondary} />
              <Text variant="headline">Analyzing…</Text>
            </View>
          ) : entry.status === 'failed' ? (
            <Text variant="headline" tone="destructive">
              Analysis failed · tap to retry
            </Text>
          ) : (
            <Text variant="headline" numberOfLines={1}>
              {a?.title}
            </Text>
          )}
          <Text variant="subheadline" tone="secondary" numberOfLines={2}>
            {a?.summary ?? entry.text}
          </Text>
          <Text variant="caption" tone="tertiary" style={{ marginTop: 4 }}>
            {meta.join('  ·  ')}
          </Text>
        </View>
        <Icon name={{ ios: 'chevron.right', android: 'chevron_right' }} size={13} color={t.textTertiary} weight="semibold" />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  badge: { borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
});
