import { dateKey } from "./dates";
import { dueReminders } from "./engine";
import type { AppState } from "./types";

export interface ReminderBatch {
  title: string;
  body: string;
  date: string;
  ids: string[];
}

export function collectReminders(
  state: AppState,
  now = new Date(),
): ReminderBatch[] {
  const timestamp = now.toISOString();
  if (new Date(state.lastReminderCheck) > now)
    state.lastReminderCheck = timestamp;
  const due = dueReminders(state, now);
  state.lastReminderCheck = timestamp;
  for (const candidate of due) {
    state.deliveries.push({
      ...candidate,
      deliveredAt: timestamp,
      failed: false,
    });
  }
  if (due.length > 3) {
    return [
      {
        title: `有 ${due.length} 条提醒等你查看`,
        body: due
          .slice(0, 3)
          .map((reminder) => reminder.title)
          .join("、"),
        date: dateKey(now),
        ids: due.map((reminder) => reminder.id),
      },
    ];
  }
  return due.map((reminder) => ({
    title: reminder.title,
    body:
      reminder.target === "task" || reminder.target === "snooze"
        ? "到了约定的时间，给这件事留一点空间。"
        : "一个值得记住的日子，快到了。",
    date: reminder.date,
    ids: [reminder.id],
  }));
}
