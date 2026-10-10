export type User = { id: number; email: string; name: string; created_at: string };

export type Scores = {
  mood: number;
  energy: number;
  productivity: number;
  stress: number;
  anxiety: number;
  social_connection: number;
  sleep_quality: number | null;
  sleep_hours: number | null;
};

export type Emotion = { name: string; intensity: number };
export type Trigger = { label: string; effect: 'positive' | 'negative'; category: string; detail: string };
export type WellbeingFlag = 'none' | 'watch' | 'concern' | 'crisis';

export type EntryAnalysis = {
  title: string;
  summary: string;
  mood_label: string;
  scores: Scores;
  emotions: Emotion[];
  triggers: Trigger[];
  activities: string[];
  people: string[];
  wins: string[];
  challenges: string[];
  gratitude: string[];
  themes: string[];
  reflection: string;
  suggestion: string;
  wellbeing_flag: WellbeingFlag;
  wellbeing_note: string;
};

export type Entry = {
  id: number;
  entry_date: string; // YYYY-MM-DD, the day the entry is about
  created_at: string;
  updated_at: string;
  text: string;
  source: 'voice' | 'text';
  duration_seconds: number | null;
  status: 'processing' | 'ready' | 'failed';
  error: string | null;
  analysis: EntryAnalysis | null;
};

export type LifeArea = { area: string; status: 'thriving' | 'steady' | 'mixed' | 'struggling' | 'unknown'; note: string };
export type Person = { name: string; relationship: string; influence: 'positive' | 'negative' | 'mixed' | 'neutral'; note: string };

export type LifeProfile = {
  headline: string;
  summary: string;
  current_chapter: string;
  life_areas: LifeArea[];
  patterns: string[];
  whats_working: string[];
  whats_not_working: string[];
  positive_triggers: string[];
  negative_triggers: string[];
  people: Person[];
  goals: string[];
  habits: string[];
  focus_suggestions: string[];
};

export type ProfileResponse = {
  status: 'empty' | 'ready' | 'updating' | 'failed';
  error: string | null;
  data: LifeProfile | null;
  entries_considered: number;
  updated_at: string | null;
};

export type MetricAverages = {
  mood: number | null;
  energy: number | null;
  productivity: number | null;
  stress: number | null;
  anxiety: number | null;
  social_connection: number | null;
  sleep_quality: number | null;
  sleep_hours: number | null;
  wellbeing: number | null;
};

export type DailyPoint = MetricAverages & { date: string; entries: number; mood_label: string | null };

export type TriggerStat = {
  label: string;
  effect: 'positive' | 'negative';
  category: string;
  count: number;
  last_detail: string;
  last_date: string;
};

export type Overview = {
  period: { start: string; end: string; days: number };
  entry_count: number;
  analyzed_count: number;
  days_journaled: number;
  streak: number;
  averages: MetricAverages;
  previous_averages: MetricAverages;
  daily: DailyPoint[];
  emotions: { name: string; count: number; avg_intensity: number }[];
  positive_triggers: TriggerStat[];
  negative_triggers: TriggerStat[];
  trigger_categories: { category: string; positive: number; negative: number }[];
  activities: { name: string; count: number; avg_mood: number; mood_lift: number | null }[];
  best_day: { date: string; wellbeing: number; mood_label: string | null } | null;
  toughest_day: { date: string; wellbeing: number; mood_label: string | null } | null;
  wellbeing_flag: { flag: WellbeingFlag; note: string; date: string } | null;
};

export type PeriodInsight = {
  headline: string;
  narrative: string;
  highlights: string[];
  watch_outs: string[];
  suggestions: string[];
};

export type InsightResponse = { status: 'empty' | 'ready'; insight: PeriodInsight | null; created_at?: string };

export type ChatMessage = { id: number; role: 'user' | 'assistant'; content: string; created_at: string };
