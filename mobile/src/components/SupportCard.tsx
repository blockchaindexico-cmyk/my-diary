import { Linking, StyleSheet, View } from 'react-native';

import type { WellbeingFlag } from '@/lib/types';
import { Spacing, useTheme } from '@/theme';

import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Icon } from './ui/Icon';
import { Text } from './ui/Text';

/** Shown when an entry (or a period) suggests the person may be struggling. */
export function SupportCard({ flag, note }: { flag: WellbeingFlag; note?: string }) {
  const t = useTheme();
  if (flag === 'none') return null;
  const urgent = flag === 'crisis' || flag === 'concern';
  return (
    <Card style={[styles.card, { borderColor: urgent ? t.destructive : t.warning }]}>
      <View style={styles.row}>
        <Icon name={{ ios: 'heart.circle.fill', android: 'favorite' }} size={22} color={urgent ? t.destructive : t.warning} />
        <Text variant="headline" style={{ flex: 1 }}>
          {flag === 'watch' ? 'Something to keep an eye on' : "You don't have to carry this alone"}
        </Text>
      </View>
      {!!note && <Text variant="subheadline">{note}</Text>}
      {urgent && (
        <>
          <Text variant="subheadline" tone="secondary">
            If you’re thinking about harming yourself or feel unsafe, please contact your local emergency number or a
            crisis line now. Talking to someone you trust, or a professional, can really help.
          </Text>
          <Button
            small
            kind="secondary"
            title="Find a helpline near you"
            icon={{ ios: 'phone.fill', android: 'call' }}
            onPress={() => Linking.openURL('https://findahelpline.com')}
          />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, gap: Spacing.sm, marginTop: Spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
