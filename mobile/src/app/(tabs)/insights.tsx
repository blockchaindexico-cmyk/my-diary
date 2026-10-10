import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { BarList, DivergingBars } from '@/components/charts/Bars';
import { LineChart, Sparkline } from '@/components/charts/LineChart';
import { Ring } from '@/components/charts/Ring';
import { SupportCard } from '@/components/SupportCard';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { EmptyState, ErrorState, Loading, Skeleton } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { api } from '@/lib/api';
import { parseISODate, shortDay, toISODate, weekdayInitial } from '@/lib/dates';
import { formatScore, METRIC, type MetricKey } from '@/lib/metrics';
import type { MetricAverages, Overview } from '@/lib/types';
import { Spacing, useTheme } from '@/theme';

const RANGES = [
  { label: 'Week', value: 7 },
  { label: 'Month', value: 30 },
  { label: '3 Months', value: 90 },
];
const TREND_METRICS: MetricKey[] = ['mood', 'energy', 'productivity', 'stress', 'anxiety', 'social_connection', 'sleep_quality'];
const KPI_METRICS: MetricKey[] = ['mood', 'energy', 'productivity', 'stress'];
// Diverging poles (cool = lifts, warm = drains), validated in the palette reference
const POLES = { light: { pos: '#2a78d6', neg: '#e34948' }, dark: { pos: '#3987e5', neg: '#e66767' } };

export default function Insights() {
  const t = useTheme();
  const [days, setDays] = useState(7);
  const end = toISODate();

  const overview = useQuery({
    queryKey: ['overview', days, end],
    queryFn: () => api.overview(days, end),
    placeholderData: keepPreviousData, // hold the previous render while a new range loads
  });

  const data = overview.data;
  return (
    <Screen
      title="Insights"
      refreshing={overview.isRefetching}
      onRefresh={() => overview.refetch()}>
      <SegmentedControl options={RANGES} value={days} onChange={setDays} />

      {overview.isPending ? (
        <Loading />
      ) : overview.isError ? (
        <ErrorState message={overview.error.message} onRetry={() => overview.refetch()} />
      ) : data && data.analyzed_count === 0 ? (
        <EmptyState
          icon={{ ios: 'chart.xyaxis.line', android: 'insights' }}
          title="No insights yet"
          message={`Record an entry and your mood, energy, efficiency and triggers for the last ${days} days will show up here.`}
          action={{ title: 'Record an entry', onPress: () => router.navigate('/') }}
        />
      ) : data ? (
        <View style={{ opacity: overview.isPlaceholderData ? 0.5 : 1 }}>
          <WellbeingHero data={data} />
          <SupportCard flag={data.wellbeing_flag?.flag ?? 'none'} note={data.wellbeing_flag?.note} />
          <KpiGrid data={data} />
          <TrendCard data={data} />
          <AiReflection days={days} end={end} />
          <EmotionsCard data={data} />
          <TriggersCard data={data} />
          <ActivitiesCard data={data} poles={POLES[t.scheme]} />
          <DaysCard data={data} />
        </View>
      ) : null}
    </Screen>
  );
}

function delta(cur: number | null, prev: number | null) {
  if (cur == null || prev == null) return null;
  return Math.round((cur - prev) * 10) / 10;
}

function DeltaLabel({ value, higherIsBetter, unit = '' }: { value: number | null; higherIsBetter: boolean; unit?: string }) {
  const t = useTheme();
  if (value == null) return <Text variant="caption" tone="tertiary">no earlier data</Text>;
  if (value === 0) return <Text variant="caption" tone="secondary">same as before</Text>;
  const good = value > 0 === higherIsBetter;
  const color = good ? t.success : t.warning;
  const icon: IconName = value > 0 ? { ios: 'arrow.up', android: 'arrow_upward' } : { ios: 'arrow.down', android: 'arrow_downward' };
  return (
    <View style={styles.delta}>
      <Icon name={icon} size={11} color={color} weight="bold" />
      <Text variant="caption" weight="600" style={{ color }}>
        {Math.abs(value)}
        {unit} {good ? 'better' : 'worse'}
      </Text>
    </View>
  );
}

function WellbeingHero({ data }: { data: Overview }) {
  const t = useTheme();
  const w = data.averages.wellbeing;
  return (
    <Card style={[styles.hero, { marginTop: Spacing.lg }]}>
      <Ring value={w} color={t.tint} size={116} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="footnote" tone="secondary" weight="600">
          WELLBEING SCORE
        </Text>
        <Text variant="title2">{wellbeingWord(w)}</Text>
        <DeltaLabel value={delta(w, data.previous_averages.wellbeing)} higherIsBetter unit=" pts" />
        <Text variant="caption" tone="secondary" style={{ marginTop: 4 }}>
          Mood, energy, efficiency, connection and sleep, minus stress and anxiety. Out of 100.
        </Text>
      </View>
    </Card>
  );
}

function wellbeingWord(w: number | null) {
  if (w == null) return 'Not enough data';
  if (w >= 75) return 'Thriving';
  if (w >= 60) return 'Doing well';
  if (w >= 45) return 'Holding steady';
  if (w >= 30) return 'Under strain';
  return 'Struggling';
}

function KpiGrid({ data }: { data: Overview }) {
  const t = useTheme();
  return (
    <View style={styles.grid}>
      {KPI_METRICS.map((key) => {
        const m = METRIC[key];
        const value = data.averages[key as keyof MetricAverages];
        return (
          <Card key={key} style={styles.tile}>
            <View style={styles.tileHeader}>
              <View style={[styles.swatch, { backgroundColor: m.color[t.scheme] }]} />
              <Text variant="footnote" tone="secondary" weight="600">
                {m.label}
              </Text>
            </View>
            <View style={styles.tileBody}>
              <Text variant="title1">
                {formatScore(value)}
                <Text variant="footnote" tone="secondary">
                  {' '}
                  /10
                </Text>
              </Text>
              <Sparkline values={data.daily.map((d) => d[key as keyof MetricAverages])} color={m.color[t.scheme]} />
            </View>
            <DeltaLabel value={delta(value, data.previous_averages[key as keyof MetricAverages])} higherIsBetter={m.higherIsBetter} />
          </Card>
        );
      })}
    </View>
  );
}

function TrendCard({ data }: { data: Overview }) {
  const t = useTheme();
  const [metric, setMetric] = useState<MetricKey>('mood');
  const [selected, setSelected] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const m = METRIC[metric];
  const points = data.daily.map((d) => ({
    key: d.date,
    xLabel: data.daily.length <= 8 ? weekdayInitial(d.date) : `${parseISODate(d.date).getDate()}`,
    value: d[metric as keyof MetricAverages],
  }));
  const sel = selected != null ? data.daily[selected] : null;
  const avg = data.averages[metric as keyof MetricAverages];

  return (
    <>
      <SectionHeader title="Trends" />
      <Card style={{ gap: Spacing.md }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
          {TREND_METRICS.map((k) => (
            <Chip
              key={k}
              label={METRIC[k].label}
              dotColor={METRIC[k].color[t.scheme]}
              selected={k === metric}
              onPress={() => setMetric(k)}
            />
          ))}
        </ScrollView>
        {/* Readout: the period average, or the selected day while scrubbing */}
        <View>
          <Text variant="footnote" tone="secondary" weight="600">
            {sel ? shortDay(sel.date).toUpperCase() : `${m.label.toUpperCase()} · DAILY AVERAGE`}
          </Text>
          <Text variant="title1">
            {formatScore(sel ? sel[metric as keyof MetricAverages] : avg)}
            <Text variant="subheadline" tone="secondary">
              {' '}
              /10
              {sel?.mood_label ? `  ·  ${sel.mood_label}` : ''}
              {sel && sel.entries === 0 ? '  ·  no entry' : ''}
            </Text>
          </Text>
        </View>
        <LineChart
          data={points}
          color={m.color[t.scheme]}
          selected={selected}
          onSelect={setSelected}
          format={(v) => formatScore(v)}
        />
        <View style={styles.trendFooter}>
          {selected != null ? (
            <Button small kind="plain" title="Clear selection" onPress={() => setSelected(null)} />
          ) : (
            <Text variant="caption" tone="secondary">
              Tap or drag across the chart to see each day.
            </Text>
          )}
          <Button small kind="plain" title={showTable ? 'Hide values' : 'Show values'} onPress={() => setShowTable((s) => !s)} />
        </View>
        {showTable && (
          <View>
            {[...data.daily].reverse().map((d) => (
              <View key={d.date} style={[styles.tableRow, { borderTopColor: t.separator }]}>
                <Text variant="subheadline">{shortDay(d.date)}</Text>
                <Text variant="subheadline" weight="600" style={{ fontVariant: ['tabular-nums'] }}>
                  {formatScore(d[metric as keyof MetricAverages])}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card>
    </>
  );
}

function AiReflection({ days, end }: { days: number; end: string }) {
  const t = useTheme();
  const insight = useQuery({
    queryKey: ['insight', days, end],
    queryFn: () => api.insight(days, end),
    staleTime: 5 * 60_000,
  });
  const label = days === 7 ? 'This week' : days === 30 ? 'This month' : 'Last 3 months';

  return (
    <>
      <SectionHeader title={label} />
      <Card style={[{ gap: Spacing.sm }, { backgroundColor: t.tintSoft }]}>
        <View style={styles.row}>
          <Icon name={{ ios: 'sparkles', android: 'auto_awesome' }} size={18} color={t.tint} />
          <Text variant="footnote" tone="tint" weight="600">
            REFLECTION
          </Text>
        </View>
        {insight.isPending ? (
          <View style={{ gap: Spacing.sm, paddingVertical: Spacing.xs }}>
            <Skeleton width="60%" height={20} />
            <Skeleton />
            <Skeleton width="85%" />
            <Skeleton width="70%" />
          </View>
        ) : insight.isError ? (
          <View style={{ gap: Spacing.sm }}>
            <Text variant="subheadline" tone="secondary">
              {insight.error.message}
            </Text>
            <Button small kind="secondary" title="Try again" onPress={() => insight.refetch()} />
          </View>
        ) : insight.data?.insight ? (
          <>
            <Text variant="title3">{insight.data.insight.headline}</Text>
            <Text variant="body">{insight.data.insight.narrative}</Text>
            <InsightList title="Went well" items={insight.data.insight.highlights} icon={{ ios: 'checkmark.circle.fill', android: 'check_circle' }} />
            <InsightList title="Keep an eye on" items={insight.data.insight.watch_outs} icon={{ ios: 'eye.fill', android: 'visibility' }} />
            <InsightList title="Try next" items={insight.data.insight.suggestions} icon={{ ios: 'arrow.forward.circle.fill', android: 'arrow_circle_right' }} />
          </>
        ) : (
          <Text variant="subheadline" tone="secondary">
            Nothing to reflect on yet for this period.
          </Text>
        )}
      </Card>
    </>
  );
}

function InsightList({ title, items, icon }: { title: string; items: string[]; icon: IconName }) {
  const t = useTheme();
  if (!items.length) return null;
  return (
    <View style={{ gap: 6, marginTop: Spacing.sm }}>
      <Text variant="headline">{title}</Text>
      {items.map((item, i) => (
        <View key={i} style={styles.listRow}>
          <Icon name={icon} size={15} color={t.tint} />
          <Text variant="subheadline" style={{ flex: 1 }}>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

function EmotionsCard({ data }: { data: Overview }) {
  const t = useTheme();
  if (!data.emotions.length) return null;
  return (
    <>
      <SectionHeader title="What you felt most" />
      <Card>
        <BarList
          rows={data.emotions.slice(0, 6).map((e) => ({
            key: e.name,
            label: e.name[0].toUpperCase() + e.name.slice(1),
            value: e.count,
            caption: `avg intensity ${e.avg_intensity}`,
          }))}
          color={METRIC.mood.color[t.scheme]}
          format={(v) => `${v}×`}
        />
      </Card>
    </>
  );
}

function TriggersCard({ data }: { data: Overview }) {
  const t = useTheme();
  if (!data.positive_triggers.length && !data.negative_triggers.length) return null;
  const section = (title: string, items: Overview['positive_triggers'], positive: boolean) =>
    items.length > 0 && (
      <View style={{ gap: Spacing.sm }}>
        <View style={styles.row}>
          <Icon
            name={positive ? { ios: 'arrow.up.circle.fill', android: 'trending_up' } : { ios: 'arrow.down.circle.fill', android: 'trending_down' }}
            size={18}
            color={positive ? t.success : t.warning}
          />
          <Text variant="headline">{title}</Text>
        </View>
        {items.map((tr) => (
          <View key={tr.label} style={styles.triggerRow} accessible accessibilityLabel={`${tr.label}, ${tr.count} times`}>
            <View style={{ flex: 1 }}>
              <Text variant="subheadline" weight="600">
                {tr.label}
              </Text>
              <Text variant="footnote" tone="secondary" numberOfLines={2}>
                {tr.last_detail}
              </Text>
            </View>
            <Text variant="subheadline" weight="600" style={{ fontVariant: ['tabular-nums'] }}>
              {tr.count}×
            </Text>
          </View>
        ))}
      </View>
    );
  return (
    <>
      <SectionHeader title="Triggers" />
      <Card style={{ gap: Spacing.xl }}>
        {section('What lifted you', data.positive_triggers, true)}
        {section('What drained you', data.negative_triggers, false)}
      </Card>
    </>
  );
}

function ActivitiesCard({ data, poles }: { data: Overview; poles: { pos: string; neg: string } }) {
  const rows = data.activities.filter((a) => a.mood_lift != null);
  if (rows.length < 2) return null;
  return (
    <>
      <SectionHeader title="What moves your mood" />
      <Card style={{ gap: Spacing.md }}>
        <Text variant="footnote" tone="secondary">
          Average mood on days with each activity, compared with your average for the period.
        </Text>
        <DivergingBars
          rows={rows
            .sort((a, b) => (b.mood_lift ?? 0) - (a.mood_lift ?? 0))
            .map((a) => ({
              key: a.name,
              label: a.name[0].toUpperCase() + a.name.slice(1),
              value: a.mood_lift ?? 0,
              caption: `${a.count} ${a.count === 1 ? 'day' : 'days'} · mood ${a.avg_mood}`,
            }))}
          positiveColor={poles.pos}
          negativeColor={poles.neg}
          format={(v) => `${v > 0 ? '+' : ''}${v}`}
        />
      </Card>
    </>
  );
}

function DaysCard({ data }: { data: Overview }) {
  return (
    <>
      <SectionHeader title="Your days" />
      <View style={styles.grid}>
        <Stat label="Streak" value={`${data.streak}`} caption={data.streak === 1 ? 'day' : 'days in a row'} />
        <Stat label="Days journaled" value={`${data.days_journaled}`} caption={`of ${data.period.days}`} />
        {data.best_day && (
          <Stat label="Best day" value={shortDay(data.best_day.date)} caption={data.best_day.mood_label ?? `${data.best_day.wellbeing}/100`} small />
        )}
        {data.toughest_day && data.toughest_day.date !== data.best_day?.date && (
          <Stat label="Toughest day" value={shortDay(data.toughest_day.date)} caption={data.toughest_day.mood_label ?? `${data.toughest_day.wellbeing}/100`} small />
        )}
      </View>
    </>
  );
}

function Stat({ label, value, caption, small }: { label: string; value: string; caption: string; small?: boolean }) {
  return (
    <Card style={styles.tile}>
      <Text variant="footnote" tone="secondary" weight="600">
        {label}
      </Text>
      <Text variant={small ? 'headline' : 'title1'} numberOfLines={1}>
        {value}
      </Text>
      <Text variant="caption" tone="secondary" numberOfLines={1}>
        {caption}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  tile: { flexGrow: 1, flexBasis: '45%', gap: 6, padding: Spacing.md },
  tileHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileBody: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  swatch: { width: 8, height: 8, borderRadius: 4 },
  delta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  listRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  triggerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingLeft: 26 },
  trendFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 36 },
  tableRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
});
