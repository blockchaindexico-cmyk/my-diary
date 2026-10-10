import { Platform } from 'react-native';

import type {
  ChatMessage,
  Entry,
  InsightResponse,
  Overview,
  ProfileResponse,
  User,
} from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const config = {
  baseUrl: '',
  token: null as string | null,
  onUnauthorized: () => {},
};

export function configureApi(next: Partial<typeof config>) {
  Object.assign(config, next);
}

type Query = Record<string, string | number | undefined | null>;

async function request<T>(
  path: string,
  options: { method?: string; json?: unknown; form?: FormData; query?: Query } = {},
): Promise<T> {
  const params = Object.entries(options.query ?? {})
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  const url = `${config.baseUrl.replace(/\/$/, '')}${path}${params ? `?${params}` : ''}`;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (config.token) headers.Authorization = `Bearer ${config.token}`;
  if (options.json !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.form ?? (options.json !== undefined ? JSON.stringify(options.json) : undefined),
    });
  } catch {
    throw new ApiError(`Can't reach the server at ${config.baseUrl}. Is it running?`, 0);
  }

  if (response.status === 401 && config.token) config.onUnauthorized();
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail;
    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail) && detail[0]?.msg
          ? String(detail[0].msg).replace(/^Value error, /, '')
          : `Something went wrong (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

type AuthResponse = { token: string; user: User };

export const api = {
  health: () => request<{ status: string }>('/health'),

  register: (name: string, email: string, password: string) =>
    request<AuthResponse>('/auth/register', { method: 'POST', json: { name, email, password } }),
  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', { method: 'POST', json: { email, password } }),
  me: () => request<User>('/auth/me'),
  deleteAccount: () => request<void>('/auth/me', { method: 'DELETE' }),

  async transcribe(uri: string): Promise<{ text: string }> {
    const form = new FormData();
    if (Platform.OS === 'web') {
      const blob = await (await fetch(uri)).blob();
      form.append('audio', blob, blob.type.includes('webm') ? 'recording.webm' : 'recording.m4a');
    } else {
      const name = uri.split('/').pop() || 'recording.m4a';
      // React Native's FormData accepts a file reference by uri
      form.append('audio', { uri, name, type: name.endsWith('.3gp') ? 'audio/3gpp' : 'audio/m4a' } as unknown as Blob);
    }
    return request('/transcribe', { method: 'POST', form });
  },

  createEntry: (body: { text: string; entry_date: string; source: 'voice' | 'text'; duration_seconds?: number | null }) =>
    request<Entry>('/entries', { method: 'POST', json: body }),
  listEntries: (query: { start?: string; end?: string; limit?: number; offset?: number } = {}) =>
    request<Entry[]>('/entries', { query }),
  getEntry: (id: number) => request<Entry>(`/entries/${id}`),
  updateEntry: (id: number, body: { text?: string; entry_date?: string }) =>
    request<Entry>(`/entries/${id}`, { method: 'PATCH', json: body }),
  reanalyzeEntry: (id: number) => request<Entry>(`/entries/${id}/reanalyze`, { method: 'POST' }),
  deleteEntry: (id: number) => request<void>(`/entries/${id}`, { method: 'DELETE' }),

  overview: (days: number, end: string) => request<Overview>('/analytics/overview', { query: { days, end } }),
  insight: (days: number, end: string) => request<InsightResponse>('/analytics/insight', { query: { days, end } }),

  profile: () => request<ProfileResponse>('/profile'),
  refreshProfile: () => request<ProfileResponse>('/profile/refresh', { method: 'POST' }),

  chatMessages: () => request<ChatMessage[]>('/chat/messages'),
  sendChat: (message: string, today: string) =>
    request<{ user_message: ChatMessage; reply: ChatMessage }>('/chat', { method: 'POST', json: { message, today } }),
  clearChat: () => request<void>('/chat/messages', { method: 'DELETE' }),
};
