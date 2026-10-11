import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { OrbGradient, useTheme } from '@/theme';

import { Icon } from './ui/Icon';

const SIZE = 168;

/**
 * The big record button. While recording it breathes with your voice:
 * `level` is the live input level from 0 (silence) to 1 (loud).
 */
export function RecordOrb({
  state,
  level,
  onPress,
}: {
  state: 'idle' | 'recording' | 'busy';
  level: number;
  onPress: () => void;
}) {
  const t = useTheme();
  const [scale] = useState(() => new Animated.Value(1));
  const [halo] = useState(() => new Animated.Value(0));
  const [idleBreath] = useState(() => new Animated.Value(0));

  // Voice-reactive scale
  useEffect(() => {
    Animated.spring(scale, {
      toValue: state === 'recording' ? 1 + level * 0.16 : 1,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();
  }, [level, state, scale]);

  // Expanding halo rings while recording
  useEffect(() => {
    if (state !== 'recording') {
      halo.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(halo, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [state, halo]);

  // Gentle breathing while idle, inviting a tap
  useEffect(() => {
    if (state !== 'idle') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(idleBreath, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(idleBreath, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [state, idleBreath]);

  const colors = OrbGradient[t.scheme];
  const glowScale = idleBreath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });

  return (
    <View style={styles.wrap}>
      {state === 'recording' &&
        [0, 0.5].map((offset) => {
          const progress = Animated.modulo(Animated.add(halo, offset), 1);
          return (
            <Animated.View
              key={offset}
              pointerEvents="none"
              style={[
                styles.halo,
                {
                  borderColor: colors[1],
                  opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                  transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
                },
              ]}
            />
          );
        })}
      <Animated.View
        pointerEvents="none"
        style={[styles.glow, { backgroundColor: colors[1], transform: [{ scale: glowScale }] }]}
      />
      <Pressable
        onPress={onPress}
        disabled={state === 'busy'}
        accessibilityRole="button"
        accessibilityLabel={state === 'recording' ? 'Stop recording' : 'Start recording'}>
        {({ pressed }) => (
          <Animated.View style={[styles.orb, { transform: [{ scale }], opacity: pressed ? 0.9 : 1 }]}>
            <LinearGradient
              colors={colors}
              start={{ x: 0.15, y: 0.1 }}
              end={{ x: 0.9, y: 0.95 }}
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient
              colors={['rgba(255,255,255,0.5)', 'rgba(255,255,255,0)']}
              start={{ x: 0.3, y: 0 }}
              end={{ x: 0.5, y: 0.55 }}
              style={StyleSheet.absoluteFill}
            />
            {state === 'busy' ? (
              <ActivityIndicator color="#FFFFFF" size="large" />
            ) : state === 'recording' ? (
              <View style={styles.stop} />
            ) : (
              <Icon name={{ ios: 'mic.fill', android: 'mic' }} size={58} color="#FFFFFF" />
            )}
          </Animated.View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE * 1.8, height: SIZE * 1.8, alignItems: 'center', justifyContent: 'center' },
  orb: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: SIZE * 1.15,
    height: SIZE * 1.15,
    borderRadius: SIZE,
    opacity: 0.22,
  },
  halo: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 2 },
  stop: { width: 46, height: 46, borderRadius: 12, backgroundColor: '#FFFFFF' },
});
