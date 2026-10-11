import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset, MaxContentWidth, Spacing, useTheme } from '@/theme';

import { Text } from './Text';

/** A tab screen with an iOS-style large title that scrolls with the content. */
export function Screen({
  title,
  eyebrow,
  accessory,
  children,
  refreshing,
  onRefresh,
  inTabs = true,
}: {
  title?: string;
  eyebrow?: string;
  accessory?: React.ReactNode;
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  inTabs?: boolean;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ backgroundColor: t.background }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.sm, paddingBottom: insets.bottom + (inTabs ? BottomTabInset : 0) + Spacing.xxxl },
      ]}
      keyboardDismissMode="on-drag"
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.textSecondary} /> : undefined
      }>
      <View style={styles.inner}>
        {(title || eyebrow) && (
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              {eyebrow && (
                <Text variant="footnote" tone="secondary" weight="600" style={styles.eyebrow}>
                  {eyebrow.toUpperCase()}
                </Text>
              )}
              {title && (
                <Text variant="largeTitle" accessibilityRole="header">
                  {title}
                </Text>
              )}
            </View>
            {accessory}
          </View>
        )}
        {children}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.lg },
  inner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: Spacing.lg, gap: Spacing.md },
  eyebrow: { letterSpacing: 0.4, marginBottom: 2 },
});
