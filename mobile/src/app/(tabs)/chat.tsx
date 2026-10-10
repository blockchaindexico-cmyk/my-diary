import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Orb } from '@/components/Orb';
import { haptic, IconButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { ErrorState, Loading } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { api } from '@/lib/api';
import { toISODate } from '@/lib/dates';
import type { ChatMessage } from '@/lib/types';
import { BottomTabInset, MaxContentWidth, Radius, Spacing, Type, useTheme } from '@/theme';

const SUGGESTIONS = [
  "What's been draining my energy lately?",
  'When am I at my best?',
  'How has my mood changed this month?',
  'What should I focus on this week?',
  "Help me understand what's stressing me out",
];

export default function Chat() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const messages = useQuery({ queryKey: ['chat'], queryFn: api.chatMessages });

  const send = useMutation({
    mutationFn: (message: string) => api.sendChat(message, toISODate()),
    onMutate: (message) => {
      // Show the question right away
      const optimistic: ChatMessage = { id: -Date.now(), role: 'user', content: message, created_at: new Date().toISOString() };
      queryClient.setQueryData<ChatMessage[]>(['chat'], (old = []) => [...old, optimistic]);
      return { optimisticId: optimistic.id };
    },
    onSuccess: ({ user_message, reply }, _message, context) => {
      haptic('light');
      queryClient.setQueryData<ChatMessage[]>(['chat'], (old = []) => [
        ...old.filter((m) => m.id !== context?.optimisticId),
        user_message,
        reply,
      ]);
    },
    onError: (_error, message, context) => {
      queryClient.setQueryData<ChatMessage[]>(['chat'], (old = []) => old.filter((m) => m.id !== context?.optimisticId));
      setText(message); // give the text back so nothing is lost
    },
  });

  const clear = useMutation({
    mutationFn: api.clearChat,
    onSuccess: () => queryClient.setQueryData(['chat'], []),
  });

  function submit(message = text) {
    const trimmed = message.trim();
    if (!trimmed || send.isPending) return;
    setText('');
    send.mutate(trimmed);
  }

  function confirmClear() {
    if (Platform.OS === 'web') return clear.mutate();
    Alert.alert('Start a new conversation?', 'This clears the chat history. Your journal entries stay as they are.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => clear.mutate() },
    ]);
  }

  const data = [...(messages.data ?? [])].reverse(); // inverted list: newest first
  const empty = messages.isSuccess && data.length === 0 && !send.isPending;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.background }} behavior="padding">
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <Text variant="largeTitle" accessibilityRole="header">
          Ask
        </Text>
        {data.length > 0 && <IconButton icon={{ ios: 'square.and.pencil', android: 'edit_square' }} label="New conversation" onPress={confirmClear} />}
      </View>

      {messages.isPending ? (
        <Loading />
      ) : messages.isError ? (
        <ErrorState message={messages.error.message} onRetry={() => messages.refetch()} />
      ) : empty ? (
        <View style={styles.empty}>
          <Orb size={72} icon={{ ios: 'sparkles', android: 'auto_awesome' }} />
          <Text variant="title2" align="center" style={{ marginTop: Spacing.lg }}>
            Talk it through
          </Text>
          <Text variant="subheadline" tone="secondary" align="center" style={{ maxWidth: 320 }}>
            I know what you’ve shared in your journal. Ask about your patterns, or get advice that fits your life.
          </Text>
          <View style={styles.suggestions}>
            {SUGGESTIONS.map((s) => (
              <Pressable
                key={s}
                onPress={() => submit(s)}
                style={({ pressed }) => [styles.suggestion, { backgroundColor: t.card, opacity: pressed ? 0.7 : 1 }]}>
                <Text variant="subheadline">{s}</Text>
                <Icon name={{ ios: 'arrow.up.right', android: 'north_east' }} size={13} color={t.textTertiary} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <FlatList
          inverted
          data={data}
          keyExtractor={(m) => String(m.id)}
          renderItem={({ item }) => <Bubble message={item} />}
          ListHeaderComponent={send.isPending ? <TypingIndicator /> : null}
          contentContainerStyle={styles.list}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        />
      )}

      {send.isError && (
        <Text variant="footnote" tone="destructive" align="center" style={{ paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xs }}>
          {send.error.message}
        </Text>
      )}

      <View
        style={[
          styles.inputBar,
          { paddingBottom: keyboardOpen ? Spacing.sm : insets.bottom + BottomTabInset + Spacing.sm },
        ]}>
        <View style={[styles.inputWrap, { backgroundColor: t.card, borderColor: t.separator }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Ask about your life…"
            placeholderTextColor={t.textTertiary}
            selectionColor={t.tint}
            multiline
            style={[Type.body, styles.input, { color: t.text }]}
            onSubmitEditing={() => submit()}
            submitBehavior="submit"
            returnKeyType="send"
          />
          <Pressable
            onPress={() => submit()}
            disabled={!text.trim() || send.isPending}
            accessibilityRole="button"
            accessibilityLabel="Send"
            hitSlop={8}
            style={[styles.send, { backgroundColor: text.trim() && !send.isPending ? t.tint : t.fillStrong }]}>
            <Icon name={{ ios: 'arrow.up', android: 'arrow_upward' }} size={17} color="#FFFFFF" weight="bold" />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const t = useTheme();
  const mine = message.role === 'user';
  return (
    <View style={[styles.bubbleRow, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
      <View
        style={[
          styles.bubble,
          mine
            ? { backgroundColor: t.bubbleUser, borderBottomRightRadius: 6 }
            : { backgroundColor: t.bubbleAssistant, borderBottomLeftRadius: 6 },
        ]}>
        <Text variant="body" selectable style={{ color: mine ? '#FFFFFF' : t.text }}>
          {message.content}
        </Text>
      </View>
    </View>
  );
}

function TypingIndicator() {
  const t = useTheme();
  const [dots] = useState(() => [0, 1, 2].map(() => new Animated.Value(0.3)));
  useEffect(() => {
    const animations = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(dot, { toValue: 1, duration: 320, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 320, useNativeDriver: true }),
          Animated.delay((2 - i) * 160),
        ]),
      ),
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [dots]);
  return (
    <View style={[styles.bubbleRow, { justifyContent: 'flex-start' }]} accessibilityLabel="Thinking">
      <View style={[styles.bubble, styles.typing, { backgroundColor: t.bubbleAssistant, borderBottomLeftRadius: 6 }]}>
        {dots.map((dot, i) => (
          <Animated.View key={i} style={[styles.dot, { backgroundColor: t.textSecondary, opacity: dot }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    width: '100%',
    maxWidth: MaxContentWidth + Spacing.lg * 2,
    alignSelf: 'center',
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.sm },
  suggestions: { width: '100%', maxWidth: 420, gap: Spacing.sm, marginTop: Spacing.xl },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    gap: Spacing.sm,
  },
  list: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    width: '100%',
    maxWidth: MaxContentWidth + Spacing.lg * 2,
    alignSelf: 'center',
  },
  bubbleRow: { flexDirection: 'row', marginVertical: 4 },
  bubble: { maxWidth: '82%', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 },
  typing: { flexDirection: 'row', gap: 5, paddingVertical: 14 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  inputBar: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, width: '100%', maxWidth: MaxContentWidth + Spacing.lg * 2, alignSelf: 'center' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: Spacing.lg,
    paddingRight: 5,
    paddingVertical: 5,
  },
  input: { flex: 1, maxHeight: 120, paddingTop: 6, paddingBottom: 6 },
  send: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginLeft: Spacing.sm },
});
