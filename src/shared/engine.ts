import {
  addDays,
  atLocalTime,
  dateKey,
  datesBetween,
  daysBetween,
  localDate,
  monthDays,
} from "./dates";
import { festivalsOn, officialDay, specialOn } from "./holidays";
import type { AppState, DayInfo, Delivery, SchedulePlan, Task } from "./types";
export function defaultState(now = new Date()): AppState {
  return {
    schemaVersion: 1,
    notes: [],
    tasks: [],
    plans: [
      {
        id: "default",
        identity: "worker",
        label: "我的作息",
        effectiveFrom: "1900-01-01",
        mode: "weekly",
        weekdays: [1, 2, 3, 4, 5],
        cycle: ["duty", "duty", "duty", "duty", "rest", "rest"],
        anchor: dateKey(now),
        followOfficial: true,
        termStart: null,
        termEnd: null,
        updatedAt: now.toISOString(),
      },
    ],
    ranges: [],
    overrides: [],
    specials: [],
    crosses: [],
    deliveries: [],
    snoozes: [],
    settings: {
      startAtLogin: false,
      reduceMotion: false,
      festivalReminders: true,
      disabledFestivals: [],
      festivalTime: "09:00",
    },
    lastReminderCheck: now.toISOString(),
  };
}
export function planOn(state: AppState, date: string): SchedulePlan {
  return (
    [...state.plans]
      .reverse()
      .filter((p) => p.effectiveFrom <= date)
      .sort(
        (a, b) =>
          b.effectiveFrom.localeCompare(a.effectiveFrom) ||
          b.updatedAt.localeCompare(a.updatedAt),
      )[0] ?? defaultState().plans[0]
  );
}
export function resolveDay(state: AppState, date: string): DayInfo {
  const p = planOn(state, date),
    official = officialDay(date);
  let kind =
    p.mode === "weekly"
      ? p.weekdays.includes(localDate(date).getDay())
        ? "duty"
        : "rest"
      : p.cycle[
          ((daysBetween(p.anchor, date) % p.cycle.length) + p.cycle.length) %
            p.cycle.length
        ];
  const dutyLabel =
    p.identity === "student"
      ? "在校"
      : p.identity === "worker"
        ? "工作"
        : "忙碌";
  let label = kind === "duty" ? dutyLabel : "休息",
    source = p.label;
  const outsideTerm =
    p.identity === "student" &&
    !!((p.termStart && date < p.termStart) || (p.termEnd && date > p.termEnd));
  if (outsideTerm) {
    kind = "rest";
    label = "非学期";
    source = "学期安排";
  }
  if (p.followOfficial && official && !outsideTerm) {
    kind = official;
    label =
      kind === "duty"
        ? p.identity === "student"
          ? "调休在校"
          : "调休上班"
        : "节假日";
    source = "国家放假调休";
  }
  const range = [...state.ranges]
    .reverse()
    .filter((r) => r.from <= date && r.to >= date)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (range) {
    kind = range.kind;
    label = range.label;
    source = "自定义区间";
  }
  const override = state.overrides.find((o) => o.id === date);
  if (override) {
    kind = override.kind;
    label = override.label || (kind === "duty" ? dutyLabel : "休息");
    source = "单日修改";
  }
  return {
    date,
    kind,
    label,
    source,
    official,
    officialKnown: ["2026", "2027"].includes(date.slice(0, 4)),
    festivals: festivalsOn(date).map((f) => f.title),
  };
}
export function nextRest(state: AppState, from: string): string | null {
  for (let i = 0; i < 366; i++) {
    const date = addDays(from, i);
    if (resolveDay(state, date).kind === "rest") return date;
  }
  return null;
}
export function taskOn(task: Task, date: string, state: AppState): boolean {
  if (!task.date || date < task.date || (task.endDate && date > task.endDate))
    return false;
  const start = localDate(task.date),
    target = localDate(date);
  switch (task.repeat) {
    case "none":
      return task.date === date;
    case "daily":
      return true;
    case "weekly":
      return start.getDay() === target.getDay();
    case "monthly":
      return (
        target.getDate() ===
        Math.min(
          start.getDate(),
          monthDays(target.getFullYear(), target.getMonth() + 1),
        )
      );
    case "yearly":
      return (
        target.getMonth() === start.getMonth() &&
        target.getDate() ===
          Math.min(
            start.getDate(),
            monthDays(target.getFullYear(), target.getMonth() + 1),
          )
      );
    case "duty":
      return resolveDay(state, date).kind === "duty";
  }
}
export function tasksOn(state: AppState, date: string): Task[] {
  return state.tasks
    .filter((t) => taskOn(t, date, state))
    .sort(
      (a, b) =>
        Number(a.completedDates.includes(date)) -
          Number(b.completedDates.includes(date)) ||
        a.time.localeCompare(b.time),
    );
}
export function overdueTasks(
  state: AppState,
  today: string,
): { task: Task; date: string }[] {
  return state.tasks
    .filter(
      (t) =>
        t.repeat === "none" &&
        t.date &&
        t.date < today &&
        !t.completedDates.includes(t.date),
    )
    .map((task) => ({ task, date: task.date! }));
}
export type ReminderCandidate = Omit<Delivery, "deliveredAt" | "failed">;
export function dueReminders(state: AppState, now: Date): ReminderCandidate[] {
  const from = dateKey(new Date(state.lastReminderCheck)),
    to = dateKey(now),
    delivered = new Set(state.deliveries.map((d) => d.id)),
    out: ReminderCandidate[] = [];
  const enqueue = (v: ReminderCandidate) => {
    if (!delivered.has(v.id) && new Date(v.fireAt) <= now) {
      out.push(v);
      delivered.add(v.id);
    }
  };
  for (const date of datesBetween(from, to)) {
    for (const task of state.tasks) {
      if (
        task.remind &&
        taskOn(task, date, state) &&
        !task.completedDates.includes(date)
      )
        enqueue({
          id: `task:${task.id}:${date}`,
          target: "task",
          targetId: task.id,
          date,
          title: task.title,
          fireAt: atLocalTime(date, task.time || "09:00").toISOString(),
        });
    }
    for (const s of state.specials.filter((s) => s.remind))
      for (const lead of s.leadDays) {
        const target = addDays(date, lead);
        if (specialOn(s, target))
          enqueue({
            id: `special:${s.id}:${target}:${lead}`,
            target: "special",
            targetId: s.id,
            date: target,
            title: `${s.title}${lead ? ` 还有${lead}天` : " 就在今天"}`,
            fireAt: atLocalTime(date, s.time).toISOString(),
          });
      }
    if (state.settings.festivalReminders)
      for (const festival of festivalsOn(addDays(date, 1)).filter(
        (f) => !state.settings.disabledFestivals.includes(f.id),
      ))
        enqueue({
          id: `festival:${festival.id}:${addDays(date, 1)}`,
          target: "festival",
          targetId: festival.id,
          date: addDays(date, 1),
          title: `明天是${festival.title}`,
          fireAt: atLocalTime(date, state.settings.festivalTime).toISOString(),
        });
  }
  for (const s of state.snoozes)
    enqueue({
      id: `snooze:${s.id}`,
      target: "snooze",
      targetId: s.targetId,
      date: s.date,
      title: s.title,
      fireAt: s.fireAt,
    });
  return out.sort((a, b) => a.fireAt.localeCompare(b.fireAt));
}
