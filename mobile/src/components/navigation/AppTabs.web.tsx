import { TabList, Tabs, TabSlot, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { forwardRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme';

import { TAB_ITEMS } from './tab-items';

/** Web stand-in for the native tab bar: a translucent bar pinned to the bottom, like iOS. */
export function AppTabs() {
  const t = useTheme();
  return (
    <Tabs style={{ flex: 1 }}>
      <TabSlot style={{ flex: 1 }} />
      <TabList asChild>
        <View
          style={StyleSheet.flatten([
            styles.bar,
            {
              backgroundColor: t.scheme === 'dark' ? 'rgba(22,22,24,0.82)' : 'rgba(249,249,249,0.86)',
              borderTopColor: t.separator,
            },
            { backdropFilter: 'saturate(180%) blur(20px)' },
          ])}>
          {TAB_ITEMS.map((item) => (
            <TabTrigger key={item.name} name={item.name} href={item.href} asChild>
              <TabButton icon={item.icon} label={item.label} />
            </TabTrigger>
          ))}
        </View>
      </TabList>
    </Tabs>
  );
}

const TabButton = forwardRef<View, TabTriggerSlotProps & { icon: (typeof TAB_ITEMS)[number]['icon']; label: string }>(
  function TabButton({ icon, label, isFocused, ...props }, ref) {
    const t = useTheme();
    const color = isFocused ? t.tint : t.textSecondary;
    return (
      <Pressable ref={ref} {...props} style={styles.item} accessibilityRole="tab" accessibilityState={{ selected: isFocused }}>
        <Icon name={icon} size={22} color={color} />
        <Text variant="caption2" style={{ color }}>
          {label}
        </Text>
      </Pressable>
    );
  },
);

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
    paddingBottom: 10,
  },
  item: { flex: 1, alignItems: 'center', gap: 2 },
});
