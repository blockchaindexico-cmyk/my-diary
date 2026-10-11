import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform, StyleSheet, TextInput, View } from 'react-native';

import { DayStrip } from '@/components/DayStrip';
import { EntryCard } from '@/components/EntryCard';
import { RecordOrb } from '@/components/RecordOrb';
import { Button, haptic } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDuration, greeting, relativeDayLabel, toISODate } from '@/lib/dates';
import { Radius, Spacing, Type, useTheme } from '@/theme';

// Mono, 64 kbps AAC: plenty for speech and small to upload
const VOICE_PRESET: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64000,
  isMeteringEnabled: true,
};
const MAX_SECONDS = 20 * 60;

const PROMPTS = [
  'How did your day start?',
  'What took most of your energy today?',
  'What made you smile?',
  "What's been on your mind?",
  'What did you get done, and what slipped?',
  'Who did you spend time with?',
  'How are you feeling right now?',
];

type Phase = 'idle' | 'recording' | 'transcribing' | 'review';

export default function Today() {
  const t = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [day, setDay] = useState(toISODate());
  const [phase, setPhase] = useState<Phase>('idle');
  const [draft, setDraft] = useState('');
  const [source, setSource] = useState<'voice' | 'text'>('voice');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [promptIndex, setPromptIndex] = useState(() => new Date().getDate() % PROMPTS.length);
  const inputRef = useRef<TextInput>(null);

  const recorder = useAudioRecorder(VOICE_PRESET);
  const recorderState = useAudioRecorderState(recorder, 80);

  const dayEntries = useQuery({
    queryKey: ['entries', 'day', day],
    queryFn: () => api.listEntries({ start: day, end: day }),
    refetchInterval: (q) => (q.state.data?.some((e) => e.status === 'processing') ? 3000 : false),
  });

  // Rotate the gentle prompt while idle
  useEffect(() => {
    if (phase !== 'idle') return;
    const id = setInterval(() => setPromptIndex((i) => (i + 1) % PROMPTS.length), 5000);
    return () => clearInterval(id);
  }, [phase]);

  // Stop automatically at the time limit
  useEffect(() => {
    if (phase === 'recording' && recorderState.durationMillis / 1000 >= MAX_SECONDS) void stopRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorderState.durationMillis, phase]);

  const save = useMutation({
    mutationFn: () =>
      api.createEntry({
        text: draft.trim(),
        entry_date: day,
        source,
        duration_seconds: source === 'voice' ? Math.round(seconds) : null,
      }),
    onSuccess: (entry) => {
      haptic('success');
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['overview'] });
      setDraft('');
      setSeconds(0);
      setPhase('idle');
      router.push({ pathname: '/entry/[id]', params: { id: String(entry.id) } });
    },
    onError: (e) => setError(e.message),
  });

  async function startRecording() {
    setError(null);
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Microphone access needed', 'Allow microphone access to record your journal by voice.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    haptic('medium');
    setPhase('recording');
  }

  async function stopRecording() {
    const elapsed = recorder.getStatus().durationMillis / 1000;
    await recorder.stop();
    haptic('medium');
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    const uri = recorder.uri;
    if (!uri || elapsed < 1) {
      setPhase(draft ? 'review' : 'idle');
      return;
    }
    setPhase('transcribing');
    try {
      const { text } = await api.transcribe(uri);
      setDraft((prev) => (prev ? `${prev.trim()} ${text}` : text));
      setSeconds((s) => s + elapsed);
      setSource('voice');
      setPhase('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transcription failed.');
      setPhase(draft ? 'review' : 'idle');
    }
  }

  function discard() {
    const doDiscard = () => {
      setDraft('');
      setSeconds(0);
      setError(null);
      setPhase('idle');
    };
    if (!draft.trim() || Platform.OS === 'web') return doDiscard();
    Alert.alert('Discard this entry?', "What you recorded won't be saved.", [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: doDiscard },
    ]);
  }

  const level = Math.max(0, Math.min(1, ((recorderState.metering ?? -60) + 55) / 50));
  const liveSeconds = recorderState.durationMillis / 1000;
  const firstName = user?.name.split(' ')[0];

  return (
    <Screen
      eyebrow={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
      title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}>
      <Text variant="footnote" tone="secondary" weight="600" style={styles.label}>
        THIS ENTRY IS ABOUT
      </Text>
      <DayStrip value={day} onChange={setDay} />

      {phase === 'review' ? (
        <Card style={{ marginTop: Spacing.xl, gap: Spacing.md }}>
          <View style={styles.reviewHeader}>
            <Text variant="headline">{relativeDayLabel(day)}</Text>
            {source === 'voice' && seconds > 0 && (
              <Text variant="footnote" tone="secondary">
                {formatDuration(seconds)} recorded
              </Text>
            )}
          </View>
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={setDraft}
            multiline
            placeholder="How was your day? Start anywhere: what happened, how you felt, what's on your mind."
            placeholderTextColor={t.textTertiary}
            selectionColor={t.tint}
            style={[Type.body, styles.editor, { color: t.text, backgroundColor: t.fill }]}
            textAlignVertical="top"
          />
          {error && (
            <Text variant="footnote" tone="destructive">
              {error}
            </Text>
          )}
          <Button
            title="Save entry"
            icon={{ ios: 'checkmark', android: 'check' }}
            onPress={() => save.mutate()}
            loading={save.isPending}
            disabled={!draft.trim()}
          />
          <View style={styles.reviewActions}>
            <Button
              small
              kind="secondary"
              title="Keep talking"
              icon={{ ios: 'mic.fill', android: 'mic' }}
              onPress={startRecording}
              style={{ flex: 1 }}
            />
            <Button small kind="destructive" title="Discard" onPress={discard} style={{ flex: 1 }} />
          </View>
        </Card>
      ) : (
        <View style={styles.center}>
          <RecordOrb
            state={phase === 'recording' ? 'recording' : phase === 'transcribing' ? 'busy' : 'idle'}
            level={level}
            onPress={phase === 'recording' ? stopRecording : startRecording}
          />
          {phase === 'recording' ? (
            <>
              <Text variant="title1" weight="600" style={styles.timer}>
                {formatDuration(liveSeconds)}
              </Text>
              <Text variant="subheadline" tone="secondary">
                Listening… tap to finish
              </Text>
            </>
          ) : phase === 'transcribing' ? (
            <>
              <Text variant="title3">Writing it down…</Text>
              <Text variant="subheadline" tone="secondary">
                Turning your words into text
              </Text>
            </>
          ) : (
            <>
              <Text variant="title3" align="center">
                {PROMPTS[promptIndex]}
              </Text>
              <Text variant="subheadline" tone="secondary" align="center">
                Tap and talk freely about {relativeDayLabel(day).toLowerCase() === 'today' ? 'your day' : relativeDayLabel(day)}
              </Text>
              <Button
                small
                kind="secondary"
                title="Write instead"
                icon={{ ios: 'keyboard', android: 'keyboard' }}
                onPress={() => {
                  setSource('text');
                  setPhase('review');
                  setTimeout(() => inputRef.current?.focus(), 250);
                }}
                style={{ marginTop: Spacing.lg }}
              />
            </>
          )}
          {error && phase === 'idle' && (
            <Text variant="footnote" tone="destructive" align="center" style={{ marginTop: Spacing.md }}>
              {error}
            </Text>
          )}
        </View>
      )}

      {!!dayEntries.data?.length && (
        <>
          <SectionHeader title={relativeDayLabel(day) === 'Today' ? 'Today so far' : relativeDayLabel(day)} />
          {dayEntries.data.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { letterSpacing: 0.4, marginBottom: Spacing.sm, marginLeft: Spacing.xs },
  center: { alignItems: 'center', marginTop: Spacing.sm, gap: Spacing.xs, minHeight: 420 },
  timer: { fontVariant: ['tabular-nums'] },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  editor: { minHeight: 180, maxHeight: 360, borderRadius: Radius.md, padding: Spacing.md },
  reviewActions: { flexDirection: 'row', gap: Spacing.sm },
});
