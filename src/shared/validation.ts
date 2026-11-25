import { z } from "zod";
import { validDate } from "./dates";
const id = z.string().min(1).max(100),
  text = z.string().max(200000),
  title = z.string().trim().min(1, "请填写名称").max(200);
const date = z.string().refine(validDate, "日期应在 1900—2100 年之间"),
  timestamp = z.iso.datetime(),
  time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const note = z.object({
  id,
  title,
  body: text,
  date: date.nullable(),
  pinned: z.boolean(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
const task = z
  .object({
    id,
    title,
    body: text,
    date: date.nullable(),
    time,
    remind: z.boolean(),
    repeat: z.enum(["none", "daily", "weekly", "monthly", "yearly", "duty"]),
    endDate: date.nullable(),
    completedDates: z.array(z.union([date, z.literal("undated")])).max(100000),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .refine(
    (t) => t.date !== null || t.repeat === "none",
    "无日期事项不能设置重复",
  )
  .refine(
    (t) => !t.endDate || (!!t.date && t.endDate >= t.date),
    "结束日期不能早于开始日期",
  );
const plan = z
  .object({
    id,
    identity: z.enum(["worker", "student", "custom"]),
    label: title,
    effectiveFrom: date,
    mode: z.enum(["weekly", "cycle"]),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7),
    cycle: z
      .array(z.enum(["duty", "rest"]))
      .min(1)
      .max(366),
    anchor: date,
    followOfficial: z.boolean(),
    termStart: date.nullable(),
    termEnd: date.nullable(),
    updatedAt: timestamp,
  })
  .refine(
    (p) =>
      (!p.termStart && !p.termEnd) ||
      (!!p.termStart && !!p.termEnd && p.termEnd >= p.termStart),
    "请填写完整且有效的学期起止日期",
  );
const range = z
  .object({
    id,
    label: title,
    from: date,
    to: date,
    kind: z.enum(["duty", "rest"]),
    updatedAt: timestamp,
  })
  .refine((r) => r.to >= r.from, "结束日期不能早于开始日期");
const override = z.object({
  id: date,
  label: title,
  kind: z.enum(["duty", "rest"]),
});
const special = z
  .object({
    id,
    title,
    kind: z.enum(["birthday", "anniversary"]),
    calendar: z.enum(["solar", "lunar"]),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    leap: z.boolean(),
    remind: z.boolean(),
    leadDays: z.array(z.number().int().min(0).max(365)).min(1).max(20),
    time,
  })
  .refine(
    (s) =>
      s.calendar === "solar"
        ? s.day <= new Date(2000, s.month, 0).getDate()
        : s.day <= 30,
    "该月份没有这个日期",
  );
const points = z
  .array(
    z.tuple([
      z.number().finite().min(0).max(100),
      z.number().finite().min(0).max(100),
    ]),
  )
  .min(2)
  .max(128);
export const settingsSchema = z.object({
  startAtLogin: z.boolean(),
  reduceMotion: z.boolean(),
  festivalReminders: z.boolean(),
  disabledFestivals: z.array(id).max(100),
  festivalTime: time,
});
const delivery = z.object({
  id: z.string().max(300),
  target: z.enum(["task", "special", "festival", "snooze"]),
  targetId: id,
  date,
  title: z.string().max(300),
  fireAt: timestamp,
  deliveredAt: timestamp,
  failed: z.boolean(),
});
const snooze = z.object({ id, targetId: id, date, title, fireAt: timestamp });
export const stateSchema = z
  .object({
    schemaVersion: z.literal(1),
    notes: z.array(note).max(100000),
    tasks: z.array(task).max(100000),
    plans: z.array(plan).min(1).max(10000),
    ranges: z.array(range).max(100000),
    overrides: z.array(override).max(100000),
    specials: z.array(special).max(10000),
    crosses: z
      .array(z.object({ id: date, points, crossedAt: timestamp }))
      .max(100000),
    deliveries: z.array(delivery).max(500000),
    snoozes: z.array(snooze).max(100000),
    settings: settingsSchema,
    lastReminderCheck: timestamp,
  })
  .superRefine((s, ctx) => {
    for (const key of [
      "notes",
      "tasks",
      "plans",
      "ranges",
      "overrides",
      "specials",
      "crosses",
      "deliveries",
      "snoozes",
    ] as const) {
      const ids = s[key].map((r) => r.id);
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({
          code: "custom",
          message: `${key} 中存在重复记录`,
          path: [key],
        });
    }
  });
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("note.save"), value: note }),
  z.object({ type: z.literal("note.delete"), id }),
  z.object({ type: z.literal("task.save"), value: task }),
  z.object({ type: z.literal("task.delete"), id }),
  z.object({
    type: z.literal("task.toggle"),
    id,
    date: z.union([date, z.literal("undated")]),
  }),
  z.object({ type: z.literal("plan.save"), value: plan }),
  z.object({ type: z.literal("range.save"), value: range }),
  z.object({ type: z.literal("range.delete"), id }),
  z.object({ type: z.literal("override.save"), value: override }),
  z.object({ type: z.literal("override.delete"), id: date }),
  z.object({ type: z.literal("special.save"), value: special }),
  z.object({ type: z.literal("special.delete"), id }),
  z.object({
    type: z.literal("cross.toggle"),
    date,
    points: points.optional(),
  }),
  z.object({ type: z.literal("settings.save"), value: settingsSchema }),
  z.object({ type: z.literal("snooze"), taskId: id, date }),
]);
