import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue } from 'react-native';

type PlatformNames = Exclude<SymbolViewProps['name'], string>;
export type IconName = { ios: NonNullable<PlatformNames['ios']>; android: NonNullable<PlatformNames['android']> };

/** SF Symbol on iOS, the matching Material Symbol on Android and web. */
export function Icon({
  name,
  size = 20,
  color,
  weight,
}: {
  name: IconName;
  size?: number;
  color: ColorValue;
  weight?: SymbolViewProps['weight'];
}) {
  return (
    <SymbolView
      name={{ ios: name.ios, android: name.android, web: name.android }}
      size={size}
      tintColor={color}
      weight={weight}
      resizeMode="scaleAspectFit"
    />
  );
}
