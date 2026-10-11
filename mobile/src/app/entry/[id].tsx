import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Meter } from '@/components/charts/Meter';
import { DayStrip } from '@/components/DayStrip';
import { FixAIButton } from '@/components/FixAIButton';
import { MoodBadge } from '@/components/EntryCard';
import { SupportCard } from '@/components/SupportCard';
import { Button, haptic } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { ErrorState, Loading, Skeleton } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { api } from '@/lib/api';
import { formatDuration, relativeDayLabel, timeOfDay } from '@/lib/dates';
import { METRICS } from '@/lib/metrics';
import type { EntryAnalysis } from '@/lib/types';
import { MaxContentWidth, Radius, Spacing, Type, useTheme } from '@/theme';

export default function EntryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entryId = Number(id);
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [draftDate, setDraftDate] = useState('');

  const query = useQuery({
    queryKey: ['entry', entryId],
    queryFn: () => api.getEntry(entryId),
    refetchInterval: (q) => (q.state.data?.status === 'processing' ? 2500 : false),
  });
  const entry = query.data;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['entries'] });
    queryClient.invalidateQueries({ queryKey: ['overview'] });
    queryClient.invalidateQueries({ queryKey: ['insight'] });
    queryClient.invalidateQueries({ queryKey: ['profile'] });
  };

  const update = useMutation({
    mutationFn: () => api.updateEntry(entryId, { text: draftText, entry_date: draftDate }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['entry', entryId], updated);
      invalidate();
      setEditing(false);
      haptic('success');
    },
  });
  const retry = useMutation({
    mutationFn: () => api.reanalyzeEntry(entryId),
    onSuccess: (updated) => queryClient.setQueryData(['entry', entryId], updated),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteEntry(entryId),
    onSuccess: () => {
      invalidate();
      router.back();
    },
  });

  function confirmDelete() {
    if (Platform.OS === 'web') return remove.mutate();
    Alert.alert('Delete this entry?', 'This permanently removes the entry and its analysis.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate() },
    ]);
  }

  // When analysis finishes, everything derived from entries (insights, profile) is stale
  const lastStatus = useRef(entry?.status);
  useEffect(() => {
    if (lastStatus.current === 'processing' && entry?.status !== 'processing') invalidate();
    lastStatus.current = entry?.status;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.status]);

  const title = entry ? relativeDayLabel(entry.entry_date) : '';

  return (
    <>
      <Stack.Screen options={{ title }} />
      <ScrollView
        style={{ backgroundColor: t.background }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xxxl }]}
        keyboardDismissMode="on-drag">
        <View style={styles.inner}>
          {query.isPending ? (
            <Loading />
          ) : query.isError ? (
            <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
          ) : entry ? (
            <>
              <Text variant="footnote" tone="secondary">
                Recorded {timeOfDay(entry.created_at)}
                {entry.source === 'voice' && entry.duration_seconds
                  ? `  ·  ${formatDuration(entry.duration_seconds)} voice note`
                  : '  ·  written'}
              </Text>

              {entry.status === 'processing' && <Analyzing />}
              {entry.status === 'failed' && (
                <Card style={{ marginTop: Spacing.lg, gap: Spacing.sm }}>
                  <Text variant="headline">Couldn’t analyze this entry</Text>
                  <Text variant="subheadline" tone="secondary">
                    {entry.error}
                  </Text>
                  <FixAIButton error={entry.error} />
                  <Button small title="Try again" onPress={() => retry.mutate()} loading={retry.isPending} />
                </Card>
              )}
              {entry.status === 'ready' && entry.analysis && <AnalysisView analysis={entry.analysis} />}

              <SectionHeader
                title="What you said"
                action={
                  !editing && (
                    <Button
                      small
                      kind="plain"
                      title="Edit"
                      onPress={() => {
                        setDraftText(entry.text);
                        setDraftDate(entry.entry_date);
                        setEditing(true);
                      }}
                    />
                  )
                }
              />
              {editing ? (
                <Card style={{ gap: Spacing.md }}>
                  <Text variant="footnote" tone="secondary" weight="600">
                    ABOUT
                  </Text>
                  <DayStrip value={draftDate} onChange={setDraftDate} days={30} />
                  <TextInput
                    value={draftText}
                    onChangeText={setDraftText}
                    multiline
                    selectionColor={t.tint}
                    style={[Type.body, styles.editor, { color: t.text, backgroundColor: t.fill }]}
                    textAlignVertical="top"
                  />
                  {update.error && (
                    <Text variant="footnote" tone="destructive">
                      {update.error.message}
                    </Text>
                  )}
                  <View style={styles.actions}>
                    <Button small kind="secondary" title="Cancel" onPress={() => setEditing(false)} style={{ flex: 1 }} />
                    <Button
                      small
                      title="Save"
                      onPress={() => update.mutate()}
                      loading={update.isPending}
                      disabled={!draftText.trim()}
                      style={{ flex: 1 }}
                    />
                  </View>
                  <Text variant="caption" tone="secondary">
                    Changing the text re-runs the analysis.
                  </Text>
                </Card>
              ) : (
                <Card>
                  <Text variant="body" selectable>
                    {entry.text}
                  </Text>
                </Card>
              )}

              <Button
                kind="destructive"
                title="Delete entry"
                onPress={confirmDelete}
                loading={remove.isPending}
                style={{ marginTop: Spacing.xxl }}
              />
            </>
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}

function Analyzing() {
  const t = useTheme();
  return (
    <Card style={{ marginTop: Spacing.lg, gap: Spacing.md }}>
      <View style={styles.row}>
        <ActivityIndicator color={t.tint} />
        <Text variant="headline">Understanding your entry…</Text>
      </View>
      <Text variant="subheadline" tone="secondary">
        Reading for mood, energy, efficiency, triggers and more. This usually takes a few seconds.
      </Text>
      <Skeleton width="70%" />
      <Skeleton width="90%" />
      <Skeleton width="55%" />
    </Card>
  );
}

function AnalysisView({ analysis: a }: { analysis: EntryAnalysis }) {
  const t = useTheme();
  const lifts = a.triggers.filter((x) => x.effect === 'positive');
  const drains = a.triggers.filter((x) => x.effect === 'negative');

  return (
    <>
      <View style={styles.titleRow}>
        <View style={{ flex: 1, gap: Spacing.xs }}>
          <Text variant="title1">{a.title}</Text>
          <View style={{ flexDirection: 'row' }}>
            <Chip label={a.mood_label} />
          </View>
        </View>
        <MoodBadge mood={a.scores.mood} size={56} />
      </View>
      <Text variant="body" style={{ marginTop: Spacing.md }}>
        {a.summary}
      </Text>

      <SupportCard flag={a.wellbeing_flag} note={a.wellbeing_note} />

      <SectionHeader title="How the day felt" />
      <Card style={{ gap: Spacing.md }}>
        {METRICS.map((m) => (
          <Meter key={m.key} label={m.label} value={a.scores[m.key]} color={m.color[t.scheme]} />
        ))}
        {a.scores.sleep_hours != null && (
          <Text variant="footnote" tone="secondary">
            Slept about {a.scores.sleep_hours} hours
          </Text>
        )}
      </Card>

      {a.emotions.length > 0 && (
        <>
          <SectionHeader title="Emotions" />
          <View style={styles.chips}>
            {a.emotions.map((e) => (
              <Chip key={e.name} label={`${e.name} · ${e.intensity}`} />
            ))}
          </View>
        </>
      )}

      {a.triggers.length > 0 && (
        <>
          <SectionHeader title="Triggers" />
          <Card padded={false}>
            {[...lifts, ...drains].map((tr, i) => (
              <View key={`${tr.label}-${i}`} style={[styles.triggerRow, i > 0 && { borderTopColor: t.separator, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <Icon
                  name={
                    tr.effect === 'positive'
                      ? { ios: 'arrow.up.circle.fill', android: 'trending_up' }
                      : { ios: 'arrow.down.circle.fill', android: 'trending_down' }
                  }
                  size={22}
                  color={tr.effect === 'positive' ? t.success : t.warning}
                />
                <View style={{ flex: 1 }}>
                  <Text variant="headline">
                    {tr.label}
                    <Text variant="footnote" tone="secondary">
                      {'  '}
                      {tr.effect === 'positive' ? 'lifted you' : 'drained you'} · {tr.category}
                    </Text>
                  </Text>
                  <Text variant="subheadline" tone="secondary">
                    {tr.detail}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        </>
      )}

      <ListCard title="Wins" items={a.wins} icon={{ ios: 'star.fill', android: 'star' }} />
      <ListCard title="Challenges" items={a.challenges} icon={{ ios: 'mountain.2.fill', android: 'landscape' }} />
      <ListCard title="Grateful for" items={a.gratitude} icon={{ ios: 'heart.fill', android: 'favorite' }} />

      {(a.activities.length > 0 || a.people.length > 0) && (
        <>
          <SectionHeader title="Activities & people" />
          <View style={styles.chips}>
            {a.activities.map((x) => (
              <Chip key={`a-${x}`} label={x} />
            ))}
            {a.people.map((x) => (
              <Chip key={`p-${x}`} label={x} dotColor={t.tint} />
            ))}
          </View>
        </>
      )}

      <Card style={[styles.reflection, { backgroundColor: t.tintSoft }]}>
        <View style={styles.row}>
          <Icon name={{ ios: 'sparkles', android: 'auto_awesome' }} size={18} color={t.tint} />
          <Text variant="headline" tone="tint">
            Reflection
          </Text>
        </View>
        <Text variant="body">{a.reflection}</Text>
        <View style={[styles.row, { marginTop: Spacing.sm }]}>
          <Icon name={{ ios: 'lightbulb.fill', android: 'lightbulb' }} size={18} color={t.tint} />
          <Text variant="headline" tone="tint">
            Try this
          </Text>
        </View>
        <Text variant="body">{a.suggestion}</Text>
      </Card>
    </>
  );
}

function ListCard({ title, items, icon }: { title: string; items: string[]; icon: Parameters<typeof Icon>[0]['name'] }) {
  const t = useTheme();
  if (!items.length) return null;
  return (
    <>
      <SectionHeader title={title} />
      <Card style={{ gap: Spacing.md }}>
        {items.map((item, i) => (
          <View key={i} style={styles.listRow}>
            <Icon name={icon} size={14} color={t.textSecondary} />
            <Text variant="body" style={{ flex: 1 }}>
              {item}
            </Text>
          </View>
        ))}
      </Card>
    </>
  );
}


const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  inner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, marginTop: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  triggerRow: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.lg, alignItems: 'flex-start' },
  listRow: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start', paddingTop: 4 },
  reflection: { marginTop: Spacing.xxl, gap: Spacing.sm },
  editor: { minHeight: 200, borderRadius: Radius.md, padding: Spacing.md },
  actions: { flexDirection: 'row', gap: Spacing.sm },
});
