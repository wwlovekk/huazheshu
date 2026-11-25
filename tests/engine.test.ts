import { describe, expect, it } from "vitest";
import {
  defaultState,
  dueReminders,
  nextRest,
  planOn,
  resolveDay,
  taskOn,
} from "../src/shared/engine";
import { addDays, dateKey, daysBetween } from "../src/shared/dates";
import {
  festivalsOn,
  lunarFor,
  nextSpecial,
  officialDay,
  specialOn,
} from "../src/shared/holidays";
import type { SpecialDate, Task } from "../src/shared/types";
const now = new Date("2026-11-24T12:00:00+08:00");
const task = (value: Partial<Task> = {}): Task => ({
  id: "t",
  title: "测试事项",
  body: "",
  date: "2026-11-24",
  time: "09:00",
  repeat: "none",
  endDate: null,
  remind: true,
  completedDates: [],
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  ...value,
});
const special = (value: Partial<SpecialDate> = {}): SpecialDate => ({
  id: "birthday",
  title: "生日",
  kind: "birthday",
  calendar: "solar",
  month: 2,
  day: 29,
  leap: false,
  remind: true,
  leadDays: [0, 1],
  time: "09:00",
  ...value,
});
describe("个人排期", () => {
  it("双休按本地日历计算，休息当天显示零天", () => {
    const s = defaultState(now);
    expect(resolveDay(s, "2026-11-28").kind).toBe("rest");
    expect(nextRest(s, "2026-11-24")).toBe("2026-11-28");
    expect(nextRest(s, "2026-11-28")).toBe("2026-11-28");
  });
  it("上四休二在跨年和锚点以前都连续计算", () => {
    const s = defaultState(now);
    Object.assign(s.plans[0], {
      mode: "cycle",
      anchor: "2026-12-29",
      followOfficial: false,
    });
    expect(
      [
        "2026-12-28",
        "2026-12-29",
        "2027-01-01",
        "2027-01-02",
        "2027-01-03",
        "2027-01-04",
      ].map((d) => resolveDay(s, d).kind),
    ).toEqual(["rest", "duty", "duty", "rest", "rest", "duty"]);
  });
  it("大小周的十四天模式不会按月份重置", () => {
    const s = defaultState(now);
    Object.assign(s.plans[0], {
      mode: "cycle",
      anchor: "2026-11-23",
      followOfficial: false,
      cycle: [
        ...Array(6).fill("duty"),
        "rest",
        ...Array(5).fill("duty"),
        "rest",
        "rest",
      ],
    });
    expect(resolveDay(s, "2026-11-28").kind).toBe("duty");
    expect(resolveDay(s, "2026-12-05").kind).toBe("rest");
    expect(resolveDay(s, "2026-12-07").kind).toBe("duty");
  });
  it("单日、最后保存区间、国家调休、基础规则依次覆盖", () => {
    const s = defaultState(now),
      d = "2026-01-01";
    expect(resolveDay(s, d).kind).toBe("rest");
    s.ranges.push({
      id: "r1",
      label: "值班",
      from: d,
      to: d,
      kind: "duty",
      updatedAt: "2026-01-01T00:00:00Z",
    });
    expect(resolveDay(s, d).label).toBe("值班");
    s.ranges.push({
      id: "r2",
      label: "年假",
      from: d,
      to: d,
      kind: "rest",
      updatedAt: "2026-01-02T00:00:00Z",
    });
    expect(resolveDay(s, d).label).toBe("年假");
    s.overrides.push({ id: d, label: "临时加班", kind: "duty" });
    expect(resolveDay(s, d).source).toBe("单日修改");
  });
  it("国家调休可关闭，未知年份不会冒充已公布数据", () => {
    const s = defaultState(now);
    expect(resolveDay(s, "2026-01-04").kind).toBe("duty");
    s.plans[0].followOfficial = false;
    expect(resolveDay(s, "2026-01-04").kind).toBe("rest");
    expect(resolveDay(s, "2028-01-01").officialKnown).toBe(false);
    expect(officialDay("2027-02-14")).toBe("duty");
  });
  it("学生的学期外休息，学期内保留每周规则和寒假", () => {
    const s = defaultState(now);
    Object.assign(s.plans[0], {
      identity: "student",
      termStart: "2026-09-01",
      termEnd: "2027-01-15",
      followOfficial: false,
    });
    expect(resolveDay(s, "2026-08-31").label).toBe("非学期");
    expect(resolveDay(s, "2026-11-24").label).toBe("在校");
    expect(resolveDay(s, "2026-11-28").kind).toBe("rest");
    s.ranges.push({
      id: "winter",
      label: "寒假",
      from: "2027-01-10",
      to: "2027-02-15",
      kind: "rest",
      updatedAt: now.toISOString(),
    });
    expect(resolveDay(s, "2027-01-11").label).toBe("寒假");
  });
  it("新生效规则不会改写此前的排期", () => {
    const s = defaultState(now);
    s.plans.push({
      ...s.plans[0],
      id: "new",
      effectiveFrom: "2026-11-24",
      weekdays: [],
      updatedAt: now.toISOString(),
    });
    expect(resolveDay(s, "2026-11-23").kind).toBe("duty");
    expect(resolveDay(s, "2026-11-24").kind).toBe("rest");
    expect(planOn(s, "2026-11-23").id).toBe("default");
  });
  it("学期之外不会被国家补班改成在校日", () => {
    const s = defaultState(now);
    Object.assign(s.plans[0], {
      identity: "student",
      termStart: "2026-09-01",
      termEnd: "2027-01-15",
      followOfficial: true,
    });
    expect(resolveDay(s, "2027-01-31").label).toBe("非学期");
  });
  it("全年无休时返回空值而不死循环", () => {
    const s = defaultState(now);
    Object.assign(s.plans[0], {
      followOfficial: false,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
    });
    expect(nextRest(s, "2026-11-24")).toBeNull();
  });
});
describe("公历、农历和重复事项", () => {
  it("月末、闰年和年度缺日取当月最后一天", () => {
    const s = defaultState(now);
    expect(
      taskOn(task({ date: "2026-01-31", repeat: "monthly" }), "2026-02-28", s),
    ).toBe(true);
    expect(
      taskOn(task({ date: "2024-02-29", repeat: "yearly" }), "2025-02-28", s),
    ).toBe(true);
    expect(specialOn(special(), "2026-02-28")).toBe(true);
    expect(specialOn(special(), "2028-02-29")).toBe(true);
  });
  it("工作日重复跟随最终个人排期", () => {
    const s = defaultState(now),
      t = task({ repeat: "duty" });
    s.overrides.push({ id: "2026-11-25", kind: "rest", label: "请假" });
    expect(taskOn(t, "2026-11-25", s)).toBe(false);
    s.overrides.push({ id: "2026-11-28", kind: "duty", label: "补班" });
    expect(taskOn(t, "2026-11-28", s)).toBe(true);
  });
  it("重复事项尊重结束日期且每次独立完成", () => {
    const s = defaultState(now),
      t = task({
        repeat: "daily",
        endDate: "2026-11-26",
        completedDates: ["2026-11-24"],
      });
    expect(taskOn(t, "2026-11-26", s)).toBe(true);
    expect(taskOn(t, "2026-11-27", s)).toBe(false);
    expect(t.completedDates.includes("2026-11-25")).toBe(false);
  });
  it("春节、除夕、清明来自实际历法日期", () => {
    expect(festivalsOn("2026-02-17").map((f) => f.title)).toContain("春节");
    expect(festivalsOn("2027-02-05").map((f) => f.title)).toContain("除夕");
    expect(festivalsOn("2026-04-05").map((f) => f.title)).toContain("清明节");
  });
  it("闰月生日在闰月年只提醒一次，在平年回到同名月份", () => {
    const s = special({ calendar: "lunar", month: 2, day: 1, leap: true });
    expect(specialOn(s, "2023-03-22")).toBe(true);
    expect(specialOn(s, "2023-02-20")).toBe(false);
    const next = nextSpecial(s, "2024-01-01")!;
    expect(lunarFor(next).getMonth()).toBe(2);
    expect(lunarFor(next).getDay()).toBe(1);
  });
  it("日期加减与天数差使用自然日", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-11-24", "2026-11-28")).toBe(4);
  });
});
describe("提醒追赶与去重", () => {
  it("休眠期间错过的多个日期都能补查，已完成的不会发送", () => {
    const s = defaultState(now);
    s.lastReminderCheck = new Date("2026-11-22T08:00:00+08:00").toISOString();
    s.tasks = [
      task({
        date: "2026-11-22",
        repeat: "daily",
        completedDates: ["2026-11-23"],
      }),
    ];
    const due = dueReminders(s, now).filter((d) => d.target === "task");
    expect(due.map((d) => d.date)).toEqual(["2026-11-22", "2026-11-24"]);
  });
  it("重启与重复扫描不会再次发送相同 occurrence", () => {
    const s = defaultState(now);
    s.tasks = [task()];
    const due = dueReminders(s, now);
    s.deliveries = due.map((d) => ({
      ...d,
      deliveredAt: now.toISOString(),
      failed: false,
    }));
    expect(dueReminders(s, now)).toHaveLength(0);
  });
  it("未来提醒不提前，稍后提醒使用独立的记录", () => {
    const s = defaultState(now);
    s.tasks = [task({ time: "23:00" })];
    expect(dueReminders(s, now)).toHaveLength(0);
    s.snoozes.push({
      id: "s",
      targetId: "t",
      date: "2026-11-24",
      title: "稍后提醒",
      fireAt: now.toISOString(),
    });
    expect(dueReminders(s, now)[0].target).toBe("snooze");
  });
});
