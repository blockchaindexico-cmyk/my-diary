import { router } from 'expo-router';

import { Button } from './ui/Button';

/** Shown next to AI errors that ask the user to finish setting up their provider. */
export function FixAIButton({ error }: { error: string | null | undefined }) {
  if (!error?.includes('AI model')) return null;
  return (
    <Button
      small
      kind="secondary"
      title="Open AI settings"
      icon={{ ios: 'gearshape', android: 'settings' }}
      onPress={() => router.push('/ai-settings')}
    />
  );
}
