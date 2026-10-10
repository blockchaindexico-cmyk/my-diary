import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Orb } from '@/components/Orb';
import { Button, haptic } from '@/components/ui/Button';
import { Field, FieldGroup } from '@/components/ui/Field';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/lib/auth';
import { Spacing, useTheme } from '@/theme';

export default function SignIn() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { signIn, signUp, serverUrl, setServerUrl } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingServer, setEditingServer] = useState(false);
  const [serverDraft, setServerDraft] = useState(serverUrl);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const isSignUp = mode === 'signUp';
  const canSubmit = email.includes('@') && password.length >= (isSignUp ? 8 : 1) && (!isSignUp || name.trim());

  async function submit() {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (isSignUp) await signUp(name, email, password);
      else await signIn(email, password);
      haptic('success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      haptic('warning');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Orb size={88} icon={{ ios: 'waveform', android: 'graphic_eq' }} />
          <Text variant="largeTitle" align="center" style={{ marginTop: Spacing.xl }}>
            Diary
          </Text>
          <Text variant="body" tone="secondary" align="center" style={{ maxWidth: 300 }}>
            Say how your day went. See what it means for you.
          </Text>
        </View>

        <FieldGroup>
          {isSignUp && (
            <Field
              placeholder="Your name"
              value={name}
              onChangeText={setName}
              textContentType="givenName"
              autoComplete="name"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
            />
          )}
          <Field
            ref={emailRef}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
            autoComplete="email"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <Field
            ref={passwordRef}
            placeholder={isSignUp ? 'Password (8+ characters)' : 'Password'}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType={isSignUp ? 'newPassword' : 'password'}
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            returnKeyType="go"
            onSubmitEditing={submit}
          />
        </FieldGroup>

        {error && (
          <Text variant="footnote" tone="destructive" align="center" style={{ marginTop: Spacing.md }}>
            {error}
          </Text>
        )}

        <Button
          title={isSignUp ? 'Create account' : 'Sign in'}
          onPress={submit}
          loading={busy}
          disabled={!canSubmit}
          style={{ marginTop: Spacing.xl }}
        />
        <Button
          kind="plain"
          title={isSignUp ? 'I already have an account' : 'New here? Create an account'}
          onPress={() => {
            setMode(isSignUp ? 'signIn' : 'signUp');
            setError(null);
          }}
          style={{ marginTop: Spacing.xs }}
        />

        <View style={styles.footer}>
          {editingServer ? (
            <View style={{ gap: Spacing.sm, width: '100%' }}>
              <FieldGroup>
                <Field
                  value={serverDraft}
                  onChangeText={setServerDraft}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  placeholder="http://192.168.1.10:8000"
                />
              </FieldGroup>
              <Button
                small
                kind="secondary"
                title="Save server"
                onPress={async () => {
                  await setServerUrl(serverDraft);
                  setEditingServer(false);
                }}
              />
            </View>
          ) : (
            <Pressable onPress={() => setEditingServer(true)} hitSlop={8}>
              <Text variant="caption" tone="secondary" align="center">
                Server: {serverUrl} · <Text variant="caption" tone="tint">Change</Text>
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: Spacing.xl, maxWidth: 480, width: '100%', alignSelf: 'center' },
  hero: { alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xxxl },
  footer: { marginTop: 'auto', paddingTop: Spacing.xxxl, alignItems: 'center' },
});
