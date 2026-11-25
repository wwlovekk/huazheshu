import { Solar, LunarYear, LunarMonth } from "lunar-typescript";
import { addDays, localDate, monthDays } from "./dates";
import type { Festival, SpecialDate } from "./types";

export const holidaySources = [
  {
    year: 2026,
    url: "https://www.beijing.gov.cn/cs/gncs/zcwj/202603/t20260327_4568275.html",
  },
  {
    year: 2027,
    url: "https://chinajob.mohrss.gov.cn/h5/c/2026-11-09/635850.shtml",
  },
];
const restRanges = [
  ["2026-01-01", "2026-01-03"],
  ["2026-02-15", "2026-02-23"],
  ["2026-04-04", "2026-04-06"],
  ["2026-05-01", "2026-05-05"],
  ["2026-06-19", "2026-06-21"],
  ["2026-09-25", "2026-09-27"],
  ["2026-10-01", "2026-10-07"],
  ["2027-01-01", "2027-01-03"],
  ["2027-02-05", "2027-02-13"],
  ["2027-04-03", "2027-04-05"],
  ["2027-05-01", "2027-05-05"],
  ["2027-06-09", "2027-06-09"],
  ["2027-09-15", "2027-09-15"],
  ["2027-10-01", "2027-10-07"],
];
const workingDates = new Set([
  "2026-01-04",
  "2026-02-14",
  "2026-02-28",
  "2026-05-09",
  "2026-09-20",
  "2026-10-10",
  "2027-01-31",
  "2027-02-14",
  "2027-05-08",
  "2027-09-26",
  "2027-10-09",
]);
export function officialDay(date: string): "duty" | "rest" | null {
  if (workingDates.has(date)) return "duty";
  return restRanges.some(([from, to]) => date >= from && date <= to)
    ? "rest"
    : null;
}
export const allFestivals: Festival[] = [
  { id: "new-year", title: "元旦" },
  { id: "new-year-eve", title: "除夕" },
  { id: "spring", title: "春节" },
  { id: "lantern", title: "元宵节" },
  { id: "qingming", title: "清明节" },
  { id: "labour", title: "劳动节" },
  { id: "dragon", title: "端午节" },
  { id: "qixi", title: "七夕" },
  { id: "mid-autumn", title: "中秋节" },
  { id: "double-nine", title: "重阳节" },
  { id: "national", title: "国庆节" },
];
export function lunarFor(date: string) {
  const d = localDate(date);
  return Solar.fromYmd(
    d.getFullYear(),
    d.getMonth() + 1,
    d.getDate(),
  ).getLunar();
}
export function lunarLabel(date: string, full = false): string {
  const l = lunarFor(date);
  return full
    ? `${l.getMonthInChinese()}月${l.getDayInChinese()}`
    : l.getDay() === 1
      ? `${l.getMonthInChinese()}月`
      : l.getDayInChinese();
}
export function festivalsOn(date: string): Festival[] {
  const d = localDate(date),
    m = d.getMonth() + 1,
    day = d.getDate(),
    l = lunarFor(date),
    lm = l.getMonth(),
    ld = l.getDay();
  const ids: string[] = [];
  if (m === 1 && day === 1) ids.push("new-year");
  if (m === 5 && day === 1) ids.push("labour");
  if (m === 10 && day === 1) ids.push("national");
  if (
    lm === 12 &&
    lunarFor(addDays(date, 1)).getMonth() === 1 &&
    lunarFor(addDays(date, 1)).getDay() === 1
  )
    ids.push("new-year-eve");
  const lunarDates: [number, number, string][] = [
    [1, 1, "spring"],
    [1, 15, "lantern"],
    [5, 5, "dragon"],
    [7, 7, "qixi"],
    [8, 15, "mid-autumn"],
    [9, 9, "double-nine"],
  ];
  for (const [month, day, id] of lunarDates)
    if (lm === month && ld === day) ids.push(id);
  if (l.getJieQi() === "清明") ids.push("qingming");
  return allFestivals.filter((f) => ids.includes(f.id));
}
export function specialOn(s: SpecialDate, date: string): boolean {
  const d = localDate(date);
  if (s.calendar === "solar")
    return (
      d.getMonth() + 1 === s.month &&
      d.getDate() === Math.min(s.day, monthDays(d.getFullYear(), s.month))
    );
  const l = lunarFor(date),
    year = l.getYear();
  const month =
    s.leap && LunarYear.fromYear(year).getLeapMonth() === s.month
      ? -s.month
      : s.month;
  const days = LunarMonth.fromYm(year, month)?.getDayCount() ?? 30;
  return l.getMonth() === month && l.getDay() === Math.min(s.day, days);
}
export function nextSpecial(s: SpecialDate, from: string): string | null {
  for (let i = 0; i < 800; i++) {
    const date = addDays(from, i);
    if (specialOn(s, date)) return date;
  }
  return null;
}
export function upcomingEvents(
  specials: SpecialDate[],
  from: string,
  limit = 6,
): { id: string; title: string; date: string; personal: boolean }[] {
  const events: {
    id: string;
    title: string;
    date: string;
    personal: boolean;
  }[] = [];
  for (const s of specials) {
    const date = nextSpecial(s, from);
    if (date) events.push({ id: s.id, title: s.title, date, personal: true });
  }
  for (let i = 0; i < 370; i++) {
    const date = addDays(from, i);
    for (const f of festivalsOn(date))
      events.push({ id: f.id, title: f.title, date, personal: false });
  }
  return events.sort((a, b) => a.date.localeCompare(b.date)).slice(0, limit);
}
