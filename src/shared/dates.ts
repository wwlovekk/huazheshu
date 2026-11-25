export const pad = (n: number) => String(n).padStart(2, "0");
export function dateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function localDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}
export function validDate(key: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(key) &&
    key >= "1900-01-01" &&
    key <= "2100-12-31" &&
    dateKey(localDate(key)) === key
  );
}
export function addDays(key: string, n: number): string {
  const d = localDate(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}
export function daysBetween(a: string, b: string): number {
  const utc = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(b) - utc(a)) / 86400000);
}
export function monthStart(key: string): string {
  return key.slice(0, 8) + "01";
}
export function addMonths(key: string, n: number): string {
  const d = localDate(monthStart(key));
  d.setMonth(d.getMonth() + n);
  return dateKey(d);
}
export function monthDays(year: number, month: number): number {
  return new Date(year, month, 0, 12).getDate();
}
export function atLocalTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}
export function* datesBetween(from: string, to: string): Generator<string> {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}
export const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
export function shortDate(key: string): string {
  const d = localDate(key);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
