export type DateKey = string;
export type DayKind = "duty" | "rest";
export type Identity = "worker" | "student" | "custom";
export interface Note {
  id: string;
  title: string;
  body: string;
  date: DateKey | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}
export type Repeat =
  | "none"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "duty";
export interface Task {
  id: string;
  title: string;
  body: string;
  date: DateKey | null;
  time: string;
  remind: boolean;
  repeat: Repeat;
  endDate: DateKey | null;
  completedDates: string[];
  createdAt: string;
  updatedAt: string;
}
export interface SchedulePlan {
  id: string;
  identity: Identity;
  label: string;
  effectiveFrom: DateKey;
  mode: "weekly" | "cycle";
  weekdays: number[];
  cycle: DayKind[];
  anchor: DateKey;
  followOfficial: boolean;
  termStart: DateKey | null;
  termEnd: DateKey | null;
  updatedAt: string;
}
export interface DateRange {
  id: string;
  label: string;
  from: DateKey;
  to: DateKey;
  kind: DayKind;
  updatedAt: string;
}
export interface DateOverride {
  id: DateKey;
  label: string;
  kind: DayKind;
}
export interface SpecialDate {
  id: string;
  title: string;
  kind: "birthday" | "anniversary";
  calendar: "solar" | "lunar";
  month: number;
  day: number;
  leap: boolean;
  remind: boolean;
  leadDays: number[];
  time: string;
}
export interface CrossOff {
  id: DateKey;
  points: [number, number][];
  crossedAt: string;
}
export interface Delivery {
  id: string;
  target: "task" | "special" | "festival" | "snooze";
  targetId: string;
  date: DateKey;
  title: string;
  fireAt: string;
  deliveredAt: string;
  failed: boolean;
}
export interface Snooze {
  id: string;
  targetId: string;
  date: DateKey;
  title: string;
  fireAt: string;
}
export interface Settings {
  startAtLogin: boolean;
  reduceMotion: boolean;
  festivalReminders: boolean;
  disabledFestivals: string[];
  festivalTime: string;
}
export interface AppState {
  schemaVersion: 1;
  notes: Note[];
  tasks: Task[];
  plans: SchedulePlan[];
  ranges: DateRange[];
  overrides: DateOverride[];
  specials: SpecialDate[];
  crosses: CrossOff[];
  deliveries: Delivery[];
  snoozes: Snooze[];
  settings: Settings;
  lastReminderCheck: string;
}
export interface DayInfo {
  date: DateKey;
  kind: DayKind;
  label: string;
  source: string;
  official: "rest" | "duty" | null;
  officialKnown: boolean;
  festivals: string[];
}
export interface Festival {
  id: string;
  title: string;
}
export type Command =
  | { type: "note.save"; value: Note }
  | { type: "note.delete"; id: string }
  | { type: "task.save"; value: Task }
  | { type: "task.delete"; id: string }
  | { type: "task.toggle"; id: string; date: DateKey | "undated" }
  | { type: "plan.save"; value: SchedulePlan }
  | { type: "range.save"; value: DateRange }
  | { type: "range.delete"; id: string }
  | { type: "override.save"; value: DateOverride }
  | { type: "override.delete"; id: string }
  | { type: "special.save"; value: SpecialDate }
  | { type: "special.delete"; id: string }
  | { type: "cross.toggle"; date: DateKey; points?: [number, number][] }
  | { type: "settings.save"; value: Settings }
  | { type: "snooze"; taskId: string; date: DateKey };
export interface DesktopAPI {
  getState(): Promise<AppState>;
  command(command: Command): Promise<AppState>;
  onState(callback: (state: AppState) => void): () => void;
  onNavigate(callback: (date: DateKey) => void): () => void;
  exportBackup(): Promise<string | null>;
  importBackup(): Promise<{ cancelled: boolean; path?: string }>;
  openDataFolder(): Promise<void>;
  testNotification(): Promise<boolean>;
  getAppInfo(): Promise<{
    version: string;
    dataPath: string;
    platform: string;
  }>;
}
declare global {
  interface Window {
    huazheshu: DesktopAPI;
  }
}
