import { taskOn } from "./engine";
import { dateKey } from "./dates";
import { commandSchema } from "./validation";
import type { AppState, Command } from "./types";

export function applyCommand(
  state: AppState,
  raw: Command,
  now: Date,
  newId: () => string,
): AppState {
  const command = commandSchema.parse(raw),
    stamp = now.toISOString();
  const upsert = <T extends { id: string }>(array: T[], value: T) => {
    const at = array.findIndex((item) => item.id === value.id);
    if (at < 0) array.push(value);
    else array[at] = value;
  };
  switch (command.type) {
    case "note.save": {
      const old = state.notes.find((n) => n.id === command.value.id);
      upsert(state.notes, {
        ...command.value,
        createdAt: old?.createdAt ?? stamp,
        updatedAt: stamp,
      });
      break;
    }
    case "note.delete":
      state.notes = state.notes.filter((n) => n.id !== command.id);
      break;
    case "task.save": {
      const old = state.tasks.find((t) => t.id === command.value.id);
      if (
        old &&
        ["date", "time", "repeat", "remind", "endDate"].some(
          (key) =>
            old[key as keyof typeof old] !==
            command.value[key as keyof typeof old],
        )
      ) {
        state.deliveries = state.deliveries.filter(
          (d) =>
            !(
              d.target === "task" &&
              d.targetId === old.id &&
              d.date >= dateKey(now)
            ),
        );
        state.snoozes = state.snoozes.filter((s) => s.targetId !== old.id);
      }
      upsert(state.tasks, {
        ...command.value,
        completedDates: old?.completedDates ?? [],
        createdAt: old?.createdAt ?? stamp,
        updatedAt: stamp,
      });
      break;
    }
    case "task.delete":
      state.tasks = state.tasks.filter((t) => t.id !== command.id);
      state.snoozes = state.snoozes.filter((s) => s.targetId !== command.id);
      break;
    case "task.toggle": {
      const task = state.tasks.find((t) => t.id === command.id);
      if (!task) throw new Error("事项已不存在");
      if (
        command.date === "undated"
          ? task.date !== null
          : !taskOn(task, command.date, state)
      )
        throw new Error("该日期没有此事项");
      task.completedDates = task.completedDates.includes(command.date)
        ? task.completedDates.filter((d) => d !== command.date)
        : [...task.completedDates, command.date];
      task.updatedAt = stamp;
      state.snoozes = state.snoozes.filter(
        (s) => !(s.targetId === task.id && s.date === command.date),
      );
      break;
    }
    case "plan.save":
      upsert(state.plans, { ...command.value, updatedAt: stamp });
      break;
    case "range.save":
      upsert(state.ranges, { ...command.value, updatedAt: stamp });
      break;
    case "range.delete":
      state.ranges = state.ranges.filter((r) => r.id !== command.id);
      break;
    case "override.save":
      upsert(state.overrides, command.value);
      break;
    case "override.delete":
      state.overrides = state.overrides.filter((o) => o.id !== command.id);
      break;
    case "special.save":
      state.deliveries = state.deliveries.filter(
        (d) =>
          !(
            d.target === "special" &&
            d.targetId === command.value.id &&
            d.date >= dateKey(now)
          ),
      );
      upsert(state.specials, command.value);
      break;
    case "special.delete":
      state.specials = state.specials.filter((s) => s.id !== command.id);
      break;
    case "cross.toggle":
      if (command.date >= dateKey(now))
        throw new Error("一天过完以后，再划掉它吧");
      if (state.crosses.some((c) => c.id === command.date))
        state.crosses = state.crosses.filter((c) => c.id !== command.date);
      else
        state.crosses.push({
          id: command.date,
          points: command.points ?? [
            [17, 73],
            [43, 48],
            [81, 23],
          ],
          crossedAt: stamp,
        });
      break;
    case "settings.save":
      state.settings = command.value;
      break;
    case "snooze": {
      const task = state.tasks.find((t) => t.id === command.taskId);
      if (
        !task ||
        !taskOn(task, command.date, state) ||
        task.completedDates.includes(command.date)
      )
        throw new Error("只有未完成的日期事项可以稍后提醒");
      state.snoozes = state.snoozes.filter(
        (s) => !(s.targetId === task.id && s.date === command.date),
      );
      state.snoozes.push({
        id: newId(),
        targetId: task.id,
        title: task.title,
        date: command.date,
        fireAt: new Date(now.getTime() + 600000).toISOString(),
      });
      break;
    }
  }
  return state;
}
