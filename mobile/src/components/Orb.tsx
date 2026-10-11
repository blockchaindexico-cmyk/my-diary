import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { OrbGradient, useTheme } from '@/theme';

import { Icon, type IconName } from './ui/Icon';

/** The app's brand mark: a soft indigo-to-violet sphere. */
export function Orb({ size = 72, icon }: { size?: number; icon?: IconName }) {
  const t = useTheme();
  return (
    <View style={[styles.glow, { width: size, height: size, borderRadius: size / 2, shadowColor: OrbGradient[t.scheme][1] }]}>
      <LinearGradient
        colors={OrbGradient[t.scheme]}
        start={{ x: 0.15, y: 0.1 }}
        end={{ x: 0.9, y: 0.95 }}
        style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.5, y: 0.6 }}
        style={[styles.sheen, { borderRadius: size / 2 }]}
      />
      {icon && <Icon name={icon} size={size * 0.4} color="#FFFFFF" weight="semibold" />}
    </View>
  );
}

const styles = StyleSheet.create({
  glow: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.9 },
});
