import { applyCommand } from "../shared/commands";
import { dateKey } from "../shared/dates";
import { defaultState } from "../shared/engine";
import { collectReminders } from "../shared/reminders";
import { stateSchema } from "../shared/validation";
import type { AppState } from "../shared/types";

// Native host calls these JSON-only functions. The rules stay in TypeScript.
export function initialState() {
  return JSON.stringify(defaultState());
}
export function validateState(state: string) {
  stateSchema.parse(JSON.parse(state));
  return state;
}
export function localDay() {
  return dateKey();
}
export function runCommand(state: string, command: string, uuid: string) {
  return JSON.stringify(
    applyCommand(
      JSON.parse(state),
      JSON.parse(command),
      new Date(),
      () => uuid,
    ),
  );
}
export function runReminders(state: string) {
  const next: AppState = JSON.parse(state);
  const notices = collectReminders(next);
  return JSON.stringify({ state: next, notices });
}
export function prepareRestore(contents: string) {
  const backup = JSON.parse(contents);
  if (backup?.format !== "huazheshu-backup" || backup.version !== 1) {
    throw new Error("这不是支持的划着数备份文件");
  }
  const state = stateSchema.parse(backup.state);
  state.lastReminderCheck = new Date().toISOString();
  return JSON.stringify(state);
}
