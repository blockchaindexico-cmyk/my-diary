import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, haptic } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Field, FieldGroup } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { ErrorState, Loading } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { api } from '@/lib/api';
import type { AIModel, AIProviderInfo, AISettings, AITestResult } from '@/lib/types';
import { MaxContentWidth, Spacing, useTheme } from '@/theme';

type Draft = { provider: string; model: string; apiKey: string; baseUrl: string; transcription: string };

function draftFor(settings: AISettings, providerId: string, transcription = settings.transcription_provider): Draft {
  const p = settings.providers.find((x) => x.id === providerId)!;
  return { provider: p.id, model: p.model, apiKey: '', baseUrl: p.base_url, transcription };
}

export default function AISettingsScreen() {
  const insets = useSafeAreaInsets();
  const query = useQuery({ queryKey: ['ai-settings'], queryFn: api.aiSettings });

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xxxl }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag">
      <View style={styles.inner}>
        {query.isPending ? (
          <Loading />
        ) : query.isError ? (
          <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
        ) : (
          <Editor settings={query.data} />
        )}
      </View>
    </ScrollView>
  );
}

function Editor({ settings }: { settings: AISettings }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => draftFor(settings, settings.provider));
  const [test, setTest] = useState<AITestResult | null>(null);
  const provider = settings.providers.find((p) => p.id === draft.provider)!;
  const editable = settings.can_edit;

  const dirty =
    draft.provider !== settings.provider ||
    draft.model !== provider.model ||
    draft.apiKey !== '' ||
    draft.baseUrl !== provider.base_url ||
    draft.transcription !== settings.transcription_provider;

  const runTest = useMutation({
    mutationFn: api.testAI,
    onMutate: () => setTest(null),
    onSuccess: (result) => {
      setTest(result);
      haptic(result.ok ? 'success' : 'warning');
    },
    onError: (e) => setTest({ ok: false, provider: provider.label, model: draft.model, error: e.message }),
  });

  const save = useMutation({
    mutationFn: () =>
      api.updateAISettings({
        provider: draft.provider,
        model: draft.model,
        base_url: provider.editable_base_url ? draft.baseUrl : undefined,
        api_key: draft.apiKey || undefined,
        transcription_provider: draft.transcription,
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(['ai-settings'], next);
      // Anything that failed for lack of a working AI can now be retried
      queryClient.invalidateQueries({ queryKey: ['insight'] });
      setDraft(draftFor(next, next.provider, next.transcription_provider));
      if (next.ready) runTest.mutate();
      else setTest(null);
    },
  });

  return (
    <>
      <StatusCard settings={settings} test={test} testing={runTest.isPending} onTest={() => runTest.mutate()} />

      {!editable && (
        <Text variant="footnote" tone="secondary" style={{ marginTop: Spacing.md, paddingHorizontal: Spacing.xs }}>
          Only the server owner (the first account created) can change these settings.
        </Text>
      )}

      <SectionHeader title="Provider" />
      <Card padded={false}>
        {settings.providers.map((p, i) => (
          <ProviderRow
            key={p.id}
            provider={p}
            selected={p.id === draft.provider}
            first={i === 0}
            disabled={!editable}
            onPress={() => setDraft((d) => draftFor(settings, p.id, d.transcription))}
          />
        ))}
      </Card>

      <SectionHeader title={provider.label} />
      <Card style={{ gap: Spacing.md }}>
        {!!provider.note && (
          <Text variant="subheadline" tone="secondary">
            {provider.note}
          </Text>
        )}
        {(provider.needs_key || provider.id === 'custom') && (
          <View style={{ gap: Spacing.xs }}>
            <Text variant="footnote" tone="secondary" weight="600">
              API KEY
            </Text>
            <FieldGroup>
              <Field
                value={draft.apiKey}
                onChangeText={(apiKey) => setDraft((d) => ({ ...d, apiKey }))}
                placeholder={provider.key_hint ? `Saved (${provider.key_hint}). Paste to replace` : 'Paste your API key'}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={editable}
              />
            </FieldGroup>
            {provider.key_source === 'env' && !draft.apiKey && (
              <Text variant="caption" tone="secondary">
                Using the key from the server’s .env file.
              </Text>
            )}
          </View>
        )}
        {provider.editable_base_url && (
          <View style={{ gap: Spacing.xs }}>
            <Text variant="footnote" tone="secondary" weight="600">
              SERVER ADDRESS
            </Text>
            <FieldGroup>
              <Field
                value={draft.baseUrl}
                onChangeText={(baseUrl) => setDraft((d) => ({ ...d, baseUrl }))}
                placeholder={provider.default_base_url || 'https://api.example.com/v1'}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                editable={editable}
              />
            </FieldGroup>
          </View>
        )}
        {!!provider.key_url && (
          <Button
            small
            kind="secondary"
            title={provider.id === 'ollama' ? 'Download Ollama' : provider.needs_key ? 'Get an API key' : 'Learn more'}
            icon={{ ios: 'arrow.up.right', android: 'north_east' }}
            onPress={() => Linking.openURL(provider.key_url)}
          />
        )}
      </Card>

      <SectionHeader title="Model" />
      <ModelPicker
        key={provider.id} // a different provider starts with a fresh list
        provider={provider}
        draft={draft}
        editable={editable}
        onChange={(model) => setDraft((d) => ({ ...d, model }))}
      />

      <SectionHeader title="Speech to text" />
      <Card padded={false}>
        {settings.transcription_options.map((o, i) => (
          <OptionRow
            key={o.id}
            label={o.label}
            selected={draft.transcription === o.id}
            first={i === 0}
            disabled={!editable}
            onPress={() => setDraft((d) => ({ ...d, transcription: o.id }))}
          />
        ))}
      </Card>
      {draft.transcription !== 'local' && (
        <Text variant="caption" tone="secondary" style={styles.caption}>
          Uses your {draft.transcription === 'groq' ? 'Groq' : 'OpenAI'} API key. Voice notes are sent to them to be
          transcribed.
        </Text>
      )}

      {save.error && (
        <Text variant="footnote" tone="destructive" style={{ marginTop: Spacing.lg }}>
          {save.error.message}
        </Text>
      )}
      {editable && (
        <Button
          title={dirty ? 'Save and test' : 'Saved'}
          onPress={() => save.mutate()}
          loading={save.isPending}
          disabled={!dirty}
          style={{ marginTop: Spacing.xl }}
        />
      )}
    </>
  );
}

function StatusCard({
  settings,
  test,
  testing,
  onTest,
}: {
  settings: AISettings;
  test: AITestResult | null;
  testing: boolean;
  onTest: () => void;
}) {
  const t = useTheme();
  const current = settings.providers.find((p) => p.id === settings.provider)!;
  const good = test ? test.ok : settings.ready;
  return (
    <Card style={{ gap: Spacing.sm }}>
      <Text variant="footnote" tone="secondary" weight="600">
        IN USE
      </Text>
      <Text variant="title3">{current.label}</Text>
      <Text variant="subheadline" tone="secondary" selectable>
        {settings.model || 'No model chosen'}
      </Text>
      <View style={styles.statusRow}>
        <Icon
          name={good ? { ios: 'checkmark.circle.fill', android: 'check_circle' } : { ios: 'exclamationmark.circle.fill', android: 'error' }}
          size={16}
          color={good ? t.success : t.warning}
        />
        <Text variant="subheadline" style={{ flex: 1, color: good ? t.success : t.warning }}>
          {test
            ? test.ok
              ? `Working: answered in ${test.seconds && test.seconds >= 1 ? `${test.seconds}s` : 'under a second'}`
              : test.error
            : settings.ready
              ? 'Set up'
              : (settings.problem ?? 'Needs setup').replace(' in You → AI model', ' below')}
        </Text>
      </View>
      {test?.ok && test.reply && (
        <Text variant="footnote" tone="secondary">
          It said: “{test.reply}”
        </Text>
      )}
      {settings.ready && (
        <Button small kind="secondary" title="Test connection" onPress={onTest} loading={testing} style={{ alignSelf: 'flex-start' }} />
      )}
    </Card>
  );
}

function ProviderRow({
  provider,
  selected,
  first,
  disabled,
  onPress,
}: {
  provider: AIProviderInfo;
  selected: boolean;
  first: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const configured = !!provider.key_hint || !provider.needs_key;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        styles.row,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.separator },
        pressed && { backgroundColor: t.cardPressed },
      ]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body">{provider.label}</Text>
        <Text variant="footnote" tone="secondary">
          {provider.pricing}
          {provider.needs_key ? (configured ? '  ·  key saved' : '') : ''}
        </Text>
      </View>
      {selected && <Icon name={{ ios: 'checkmark', android: 'check' }} size={17} color={t.tint} weight="semibold" />}
    </Pressable>
  );
}

function OptionRow({
  label,
  selected,
  first,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  first: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        styles.row,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.separator },
        pressed && { backgroundColor: t.cardPressed },
      ]}>
      <Text variant="body" style={{ flex: 1 }}>
        {label}
      </Text>
      {selected && <Icon name={{ ios: 'checkmark', android: 'check' }} size={17} color={t.tint} weight="semibold" />}
    </Pressable>
  );
}

function ModelPicker({
  provider,
  draft,
  editable,
  onChange,
}: {
  provider: AIProviderInfo;
  draft: Draft;
  editable: boolean;
  onChange: (model: string) => void;
}) {
  const t = useTheme();
  const [search, setSearch] = useState('');
  const [freeOnly, setFreeOnly] = useState(provider.id === 'openrouter');

  const list = useMutation({
    mutationFn: () =>
      api.aiModels({
        provider: provider.id,
        api_key: draft.apiKey || undefined,
        base_url: provider.editable_base_url ? draft.baseUrl : undefined,
      }),
  });
  const models = list.data?.models;
  const hasFreeInfo = models?.some((m) => m.free !== null) ?? false;
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (models ?? [])
      .filter((m) => !freeOnly || !hasFreeInfo || m.free)
      .filter((m) => !q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
      .slice(0, 80);
  }, [models, search, freeOnly, hasFreeInfo]);

  return (
    <Card style={{ gap: Spacing.md }}>
      <FieldGroup>
        <Field
          value={draft.model}
          onChangeText={onChange}
          placeholder={provider.default_model || 'Model ID, or browse below'}
          autoCapitalize="none"
          autoCorrect={false}
          editable={editable}
        />
      </FieldGroup>
      {!!provider.default_model && draft.model !== provider.default_model && editable && (
        <Button small kind="plain" title={`Use default (${provider.default_model})`} onPress={() => onChange(provider.default_model)} style={{ alignSelf: 'flex-start' }} />
      )}
      {editable && (
        <Button
          small
          kind="secondary"
          title={models ? 'Refresh list' : `Browse ${provider.label} models`}
          icon={{ ios: 'list.bullet', android: 'list' }}
          onPress={() => list.mutate()}
          loading={list.isPending}
        />
      )}
      {list.error && (
        <Text variant="footnote" tone="destructive">
          {list.error.message}
        </Text>
      )}
      {models && (
        <View style={{ gap: Spacing.sm }}>
          <FieldGroup>
            <Field value={search} onChangeText={setSearch} placeholder="Search models" autoCapitalize="none" autoCorrect={false} />
          </FieldGroup>
          {hasFreeInfo && (
            <View style={styles.chips}>
              <Chip label="Free only" selected={freeOnly} onPress={() => setFreeOnly(true)} />
              <Chip label="All" selected={!freeOnly} onPress={() => setFreeOnly(false)} />
            </View>
          )}
          <Text variant="caption" tone="secondary">
            {shown.length} of {models.length} models
          </Text>
          {shown.map((m) => (
            <ModelRow key={m.id} model={m} selected={m.id === draft.model} onPress={() => onChange(m.id)} />
          ))}
        </View>
      )}
      {list.isPending && <ActivityIndicator color={t.textSecondary} />}
    </Card>
  );
}

function ModelRow({ model, selected, onPress }: { model: AIModel; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic('light');
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.modelRow, { backgroundColor: selected ? t.tintSoft : pressed ? t.cardPressed : t.fill }]}>
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="subheadline" weight="600" numberOfLines={1}>
          {model.name}
        </Text>
        <Text variant="caption" tone="secondary" numberOfLines={1}>
          {model.id}
          {model.context_length ? `  ·  ${Math.round(model.context_length / 1000)}K context` : ''}
        </Text>
      </View>
      {model.free && (
        <View style={[styles.freeBadge, { borderColor: t.success }]}>
          <Text variant="caption2" style={{ color: t.success }}>
            FREE
          </Text>
        </View>
      )}
      {selected && <Icon name={{ ios: 'checkmark', android: 'check' }} size={16} color={t.tint} weight="semibold" />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  inner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginTop: Spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: 12, minHeight: 50 },
  chips: { flexDirection: 'row', gap: Spacing.sm },
  modelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: 12 },
  freeBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  caption: { marginTop: Spacing.sm, paddingHorizontal: Spacing.xs },
});
