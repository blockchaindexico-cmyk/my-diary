import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, Platform, StyleSheet, View } from 'react-native';

import { Orb } from '@/components/Orb';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { LifeArea, LifeProfile, Person } from '@/lib/types';
import { Radius, Spacing, useTheme } from '@/theme';

export default function Profile() {
  const t = useTheme();
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: ['profile'],
    queryFn: api.profile,
    refetchInterval: (q) => (q.state.data?.status === 'updating' ? 3000 : false),
  });
  const refresh = useMutation({
    mutationFn: api.refreshProfile,
    onSuccess: (data) => queryClient.setQueryData(['profile'], data),
  });

  const p = profile.data;
  const updating = p?.status === 'updating' || refresh.isPending;

  return (
    <Screen
      title="You"
      refreshing={profile.isRefetching}
      onRefresh={() => profile.refetch()}
      accessory={
        p?.data ? (
          updating ? (
            <ActivityIndicator color={t.tint} />
          ) : (
            <IconButton icon={{ ios: 'arrow.clockwise', android: 'refresh' }} label="Rebuild profile" onPress={() => refresh.mutate()} />
          )
        ) : undefined
      }>
      {profile.isPending ? (
        <Loading />
      ) : profile.isError ? (
        <ErrorState message={profile.error.message} onRetry={() => profile.refetch()} />
      ) : p?.data ? (
        <ProfileView data={p.data} entries={p.entries_considered} updatedAt={p.updated_at} updating={updating} error={p.status === 'failed' ? p.error : null} />
      ) : updating ? (
        <EmptyState icon={{ ios: 'sparkles', android: 'auto_awesome' }} title="Building your profile…" message="Reading through your entries. This takes a few seconds." />
      ) : (
        <EmptyState
          icon={{ ios: 'person.crop.circle', android: 'account_circle' }}
          title="Your profile builds itself"
          message="As you journal, Diary pieces together what's going on in your life: patterns, what's working, what isn't, and the people who matter."
          action={{ title: 'Record an entry', onPress: () => router.navigate('/') }}
        />
      )}

      <Settings />
    </Screen>
  );
}

function ProfileView({
  data,
  entries,
  updatedAt,
  updating,
  error,
}: {
  data: LifeProfile;
  entries: number;
  updatedAt: string | null;
  updating: boolean;
  error: string | null;
}) {
  const t = useTheme();
  const { user } = useAuth();
  return (
    <>
      <Card style={{ gap: Spacing.md }}>
        <View style={styles.identity}>
          <Orb size={52} />
          <View style={{ flex: 1 }}>
            <Text variant="title3">{user?.name}</Text>
            <Text variant="footnote" tone="secondary">
              {updating ? 'Updating with your latest entries…' : `From ${entries} ${entries === 1 ? 'entry' : 'entries'}${updatedAt ? ` · updated ${timeAgo(updatedAt)}` : ''}`}
            </Text>
          </View>
        </View>
        <Text variant="title3">{data.headline}</Text>
        <Text variant="body">{data.summary}</Text>
        {error && (
          <Text variant="footnote" tone="destructive">
            Last update failed: {error}
          </Text>
        )}
      </Card>

      <SectionHeader title="Right now" />
      <Card>
        <Text variant="body">{data.current_chapter}</Text>
      </Card>

      {data.life_areas.length > 0 && (
        <>
          <SectionHeader title="Life areas" />
          <View style={styles.grid}>
            {data.life_areas.map((area) => (
              <AreaCard key={area.area} area={area} />
            ))}
          </View>
        </>
      )}

      <BulletCard title="Patterns we've noticed" items={data.patterns} icon={{ ios: 'point.3.connected.trianglepath.dotted', android: 'hub' }} />
      <BulletCard title="What's working" items={data.whats_working} icon={{ ios: 'checkmark.circle.fill', android: 'check_circle' }} color={t.success} />
      <BulletCard title="What isn't" items={data.whats_not_working} icon={{ ios: 'xmark.circle.fill', android: 'cancel' }} color={t.warning} />

      {(data.positive_triggers.length > 0 || data.negative_triggers.length > 0) && (
        <>
          <SectionHeader title="Triggers" />
          <Card style={{ gap: Spacing.md }}>
            <TriggerChips title="Lifts you" items={data.positive_triggers} icon={{ ios: 'arrow.up.circle.fill', android: 'trending_up' }} color={t.success} />
            <TriggerChips title="Drains you" items={data.negative_triggers} icon={{ ios: 'arrow.down.circle.fill', android: 'trending_down' }} color={t.warning} />
          </Card>
        </>
      )}

      {data.people.length > 0 && (
        <>
          <SectionHeader title="People in your life" />
          <Card padded={false}>
            {data.people.map((person, i) => (
              <PersonRow key={person.name} person={person} first={i === 0} />
            ))}
          </Card>
        </>
      )}

      <BulletCard title="Goals" items={data.goals} icon={{ ios: 'flag.fill', android: 'flag' }} />
      <BulletCard title="Habits" items={data.habits} icon={{ ios: 'repeat', android: 'repeat' }} />

      {data.focus_suggestions.length > 0 && (
        <>
          <SectionHeader title="Focus this week" />
          <Card style={{ gap: Spacing.md, backgroundColor: t.tintSoft }}>
            {data.focus_suggestions.map((s, i) => (
              <View key={i} style={styles.bullet}>
                <View style={[styles.number, { backgroundColor: t.tint }]}>
                  <Text variant="caption" weight="700" tone="onTint">
                    {i + 1}
                  </Text>
                </View>
                <Text variant="body" style={{ flex: 1 }}>
                  {s}
                </Text>
              </View>
            ))}
          </Card>
        </>
      )}
    </>
  );
}

const AREA_STATUS: Record<LifeArea['status'], { label: string; icon: IconName; color: (t: ReturnType<typeof useTheme>) => string }> = {
  thriving: { label: 'Thriving', icon: { ios: 'sun.max.fill', android: 'sunny' }, color: (t) => t.success },
  steady: { label: 'Steady', icon: { ios: 'equal.circle.fill', android: 'drag_handle' }, color: (t) => t.tint },
  mixed: { label: 'Mixed', icon: { ios: 'cloud.sun.fill', android: 'partly_cloudy_day' }, color: (t) => t.warning },
  struggling: { label: 'Struggling', icon: { ios: 'cloud.rain.fill', android: 'rainy' }, color: (t) => t.destructive },
  unknown: { label: 'Not enough yet', icon: { ios: 'questionmark.circle', android: 'help' }, color: (t) => t.textSecondary },
};

function AreaCard({ area }: { area: LifeArea }) {
  const t = useTheme();
  const status = AREA_STATUS[area.status] ?? AREA_STATUS.unknown;
  const color = status.color(t);
  return (
    <Card style={styles.areaCard}>
      <Text variant="headline">{area.area}</Text>
      <View style={styles.statusRow}>
        <Icon name={status.icon} size={14} color={color} />
        <Text variant="footnote" weight="600" style={{ color }}>
          {status.label}
        </Text>
      </View>
      <Text variant="footnote" tone="secondary">
        {area.note}
      </Text>
    </Card>
  );
}

function BulletCard({ title, items, icon, color }: { title: string; items: string[]; icon: IconName; color?: string }) {
  const t = useTheme();
  if (!items.length) return null;
  return (
    <>
      <SectionHeader title={title} />
      <Card style={{ gap: Spacing.md }}>
        {items.map((item, i) => (
          <View key={i} style={styles.bullet}>
            <Icon name={icon} size={16} color={color ?? t.tint} />
            <Text variant="body" style={{ flex: 1 }}>
              {item}
            </Text>
          </View>
        ))}
      </Card>
    </>
  );
}

function TriggerChips({ title, items, icon, color }: { title: string; items: string[]; icon: IconName; color: string }) {
  if (!items.length) return null;
  return (
    <View style={{ gap: Spacing.sm }}>
      <View style={styles.statusRow}>
        <Icon name={icon} size={16} color={color} />
        <Text variant="headline">{title}</Text>
      </View>
      <View style={styles.chips}>
        {items.map((x) => (
          <Chip key={x} label={x} />
        ))}
      </View>
    </View>
  );
}

const INFLUENCE: Record<Person['influence'], string> = {
  positive: 'Good for you',
  negative: 'Draining',
  mixed: 'Complicated',
  neutral: 'Neutral',
};

function PersonRow({ person, first }: { person: Person; first: boolean }) {
  const t = useTheme();
  return (
    <View style={[styles.person, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.separator }]}>
      <View style={[styles.avatar, { backgroundColor: t.tintSoft }]}>
        <Text variant="headline" tone="tint">
          {person.name.slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="headline">
          {person.name}
          <Text variant="footnote" tone="secondary">
            {'  '}
            {person.relationship} · {INFLUENCE[person.influence] ?? person.influence}
          </Text>
        </Text>
        <Text variant="subheadline" tone="secondary">
          {person.note}
        </Text>
      </View>
    </View>
  );
}

function Settings() {
  const t = useTheme();
  const { user, serverUrl, signOut } = useAuth();
  const ai = useQuery({ queryKey: ['ai-settings'], queryFn: api.aiSettings });
  const aiProvider = ai.data?.providers.find((p) => p.id === ai.data?.provider);
  const remove = useMutation({ mutationFn: api.deleteAccount, onSuccess: () => signOut() });

  function confirmDelete() {
    const message = 'This permanently deletes your account, every entry, your profile and your chat history.';
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(message)) remove.mutate();
      return;
    }
    Alert.alert('Delete account?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete everything', style: 'destructive', onPress: () => remove.mutate() },
    ]);
  }

  return (
    <>
      <SectionHeader title="AI" />
      <Card padded={false} onPress={() => router.push('/ai-settings')}>
        <View style={styles.settingRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="body">AI model</Text>
            <Text variant="footnote" tone="secondary" numberOfLines={1}>
              {ai.data ? `${aiProvider?.label ?? ai.data.provider} · ${ai.data.model || 'no model chosen'}` : ' '}
            </Text>
          </View>
          {ai.data && !ai.data.ready && (
            <Text variant="footnote" weight="600" style={{ color: t.warning }}>
              Set up
            </Text>
          )}
          <Icon name={{ ios: 'chevron.right', android: 'chevron_right' }} size={13} color={t.textTertiary} weight="semibold" />
        </View>
      </Card>

      <SectionHeader title="Account" />
      <Card padded={false}>
        <View style={styles.settingRow}>
          <Text variant="body">Email</Text>
          <Text variant="body" tone="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>
            {user?.email}
          </Text>
        </View>
        <View style={[styles.settingRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.separator }]}>
          <Text variant="body">Server</Text>
          <Text variant="body" tone="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>
            {serverUrl}
          </Text>
        </View>
      </Card>
      <View style={{ gap: Spacing.sm, marginTop: Spacing.lg }}>
        <Button kind="secondary" title="Sign out" onPress={signOut} />
        <Button kind="destructive" title="Delete account and data" onPress={confirmDelete} loading={remove.isPending} />
      </View>
      <Text variant="caption" tone="secondary" align="center" style={{ marginTop: Spacing.xl, paddingHorizontal: Spacing.lg }}>
        Diary helps you reflect. It isn’t a medical service and can’t diagnose anything. If you’re struggling, please
        reach out to someone you trust or a professional.
      </Text>
    </>
  );
}

function timeAgo(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  areaCard: { flexGrow: 1, flexBasis: '45%', gap: 6, padding: Spacing.md },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bullet: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  number: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  person: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.lg, alignItems: 'flex-start' },
  avatar: { width: 36, height: 36, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.lg, paddingHorizontal: Spacing.lg, paddingVertical: 13 },
});
