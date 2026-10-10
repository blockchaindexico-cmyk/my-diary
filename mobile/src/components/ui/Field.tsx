import { forwardRef } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Radius, Spacing, Type, useTheme } from '@/theme';

/** A group of inputs in one rounded card separated by hairlines, like iOS Settings. */
export function FieldGroup({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const items = (Array.isArray(children) ? children : [children]).filter(Boolean);
  return (
    <View style={[styles.group, { backgroundColor: t.card }]}>
      {items.map((child, i) => (
        <View key={i}>
          {i > 0 && <View style={[styles.separator, { backgroundColor: t.separator }]} />}
          {child}
        </View>
      ))}
    </View>
  );
}

export const Field = forwardRef<TextInput, TextInputProps>(function Field({ style, ...props }, ref) {
  const t = useTheme();
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={t.textTertiary}
      selectionColor={t.tint}
      style={[styles.input, Type.body, { color: t.text }, style]}
      {...props}
    />
  );
});

const styles = StyleSheet.create({
  group: { borderRadius: Radius.md, overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: Spacing.lg },
  input: { paddingHorizontal: Spacing.lg, paddingVertical: 13, minHeight: 50 },
});
