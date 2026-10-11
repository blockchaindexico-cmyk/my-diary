import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EntryCard } from '@/components/EntryCard';
import { EmptyState, ErrorState, Loading } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { api } from '@/lib/api';
import { relativeDayLabel } from '@/lib/dates';
import type { Entry } from '@/lib/types';
import { BottomTabInset, MaxContentWidth, Spacing, useTheme } from '@/theme';

const PAGE = 30;

export default function Journal() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const query = useInfiniteQuery({
    queryKey: ['entries', 'all'],
    queryFn: ({ pageParam }) => api.listEntries({ limit: PAGE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.length === PAGE ? pages.length * PAGE : undefined),
    refetchInterval: (q) => (q.state.data?.pages.flat().some((e) => e.status === 'processing') ? 3000 : false),
  });

  const sections = useMemo(() => {
    const groups = new Map<string, Entry[]>();
    for (const e of query.data?.pages.flat() ?? []) {
      groups.set(e.entry_date, [...(groups.get(e.entry_date) ?? []), e]);
    }
    return [...groups.entries()].map(([date, data]) => ({ date, data }));
  }, [query.data]);

  const header = (
    <Text variant="largeTitle" accessibilityRole="header" style={{ marginBottom: Spacing.sm }}>
      Journal
    </Text>
  );

  return (
    <SectionList
      style={{ backgroundColor: t.background }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.sm, paddingBottom: insets.bottom + BottomTabInset + Spacing.xxxl },
      ]}
      sections={sections}
      keyExtractor={(e) => String(e.id)}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={header}
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHeader}>
          <Text variant="headline">{relativeDayLabel(section.date)}</Text>
          <Text variant="footnote" tone="secondary">
            {section.data.length} {section.data.length === 1 ? 'entry' : 'entries'}
          </Text>
        </View>
      )}
      renderItem={({ item }) => <EntryCard entry={item} />}
      ListEmptyComponent={
        query.isPending ? (
          <Loading />
        ) : query.isError ? (
          <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
        ) : (
          <EmptyState
            icon={{ ios: 'book', android: 'menu_book' }}
            title="Your journal is empty"
            message="Record your first entry: just talk about your day. It'll show up here with your mood and more."
            action={{ title: 'Record an entry', onPress: () => router.navigate('/') }}
          />
        )
      }
      ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator style={{ margin: Spacing.lg }} /> : null}
      onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
      onEndReachedThreshold={0.4}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          onRefresh={() => query.refetch()}
          tintColor={t.textSecondary}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.lg, width: '100%', maxWidth: MaxContentWidth + Spacing.lg * 2, alignSelf: 'center' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
});
