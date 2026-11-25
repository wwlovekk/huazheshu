import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppStore } from "../src/main/store";
const now = new Date("2026-11-24T12:00:00+08:00"),
  paths: string[] = [],
  stores: AppStore[] = [];
function open(path?: string) {
  const p = path ?? mkdtempSync(join(tmpdir(), "huazheshu-test-"));
  if (!path) paths.push(p);
  const store = new AppStore(p, now);
  stores.push(store);
  return store;
}
afterEach(() => {
  for (const store of stores.splice(0))
    try {
      store.close();
    } catch {}
  for (const path of paths.splice(0))
    rmSync(path, { recursive: true, force: true });
});
describe("真实 SQLite 持久化与备份", () => {
  it("修改已提醒事项的时间允许重新安排，改标题保留去重记录", () => {
    const store = open(),
      stamp = now.toISOString(),
      value = {
        id: "t",
        title: "提醒",
        body: "",
        date: "2026-11-24",
        time: "09:00",
        remind: true,
        repeat: "none" as const,
        endDate: null,
        completedDates: [],
        createdAt: stamp,
        updatedAt: stamp,
      };
    store.command({ type: "task.save", value }, now);
    const s = store.get();
    s.deliveries = [
      {
        id: "task:t:2026-11-24",
        target: "task",
        targetId: "t",
        date: "2026-11-24",
        title: "提醒",
        fireAt: stamp,
        deliveredAt: stamp,
        failed: false,
      },
    ];
    store.write(s);
    store.command(
      { type: "task.save", value: { ...value, title: "改个标题" } },
      now,
    );
    expect(store.get().deliveries).toHaveLength(1);
    store.command(
      { type: "task.save", value: { ...value, time: "18:00" } },
      now,
    );
    expect(store.get().deliveries).toHaveLength(0);
  });
  it("备忘、独立完成记录、笔迹及撤销在重启后保留", () => {
    let store = open(),
      path = store.directory;
    const stamp = now.toISOString();
    store.command(
      {
        type: "note.save",
        value: {
          id: "n",
          title: "一条备忘",
          body: "中文正文\n第二行",
          date: null,
          pinned: true,
          createdAt: stamp,
          updatedAt: stamp,
        },
      },
      now,
    );
    store.command(
      {
        type: "task.save",
        value: {
          id: "t",
          title: "每日读书",
          body: "",
          date: "2026-11-24",
          time: "09:00",
          remind: true,
          repeat: "daily",
          endDate: null,
          completedDates: [],
          createdAt: stamp,
          updatedAt: stamp,
        },
      },
      now,
    );
    store.command({ type: "task.toggle", id: "t", date: "2026-11-24" }, now);
    store.command({ type: "cross.toggle", date: "2026-11-23" }, now);
    store.close();
    stores.pop();
    store = open(path);
    expect(store.get().notes[0].body).toContain("第二行");
    expect(store.get().tasks[0].completedDates).toEqual(["2026-11-24"]);
    expect(store.get().crosses[0].id).toBe("2026-11-23");
    store.command({ type: "cross.toggle", date: "2026-11-23" }, now);
    expect(store.get().crosses).toHaveLength(0);
    expect(store.get().tasks[0].completedDates).toHaveLength(1);
  });
  it("今天和未来日期不能划掉，非法坐标不能进入数据", () => {
    const store = open();
    expect(() =>
      store.command({ type: "cross.toggle", date: "2026-11-24" }, now),
    ).toThrow();
    expect(() =>
      store.command(
        {
          type: "cross.toggle",
          date: "2026-11-23",
          points: [
            [0, 0],
            [1000, 20],
          ],
        },
        now,
      ),
    ).toThrow();
    expect(store.get().crosses).toHaveLength(0);
  });
  it("坏备份和重复ID被拒绝，原有数据保持不变", () => {
    const store = open(),
      path = join(store.directory, "bad.json"),
      before = store.get();
    writeFileSync(
      path,
      JSON.stringify({
        format: "huazheshu-backup",
        version: 1,
        state: { ...before, schemaVersion: 99 },
      }),
    );
    expect(() => store.importFrom(path)).toThrow();
    expect(store.get()).toEqual(before);
    writeFileSync(
      path,
      JSON.stringify({
        format: "huazheshu-backup",
        version: 1,
        state: { ...before, plans: [...before.plans, ...before.plans] },
      }),
    );
    expect(() => store.importFrom(path)).toThrow();
    expect(store.get()).toEqual(before);
  });
  it("导出、修改、恢复完成往返，并保存恢复前快照", () => {
    const store = open(),
      path = join(store.directory, "backup.json");
    store.exportTo(path);
    store.command(
      {
        type: "override.save",
        value: { id: "2026-11-24", label: "请假", kind: "rest" },
      },
      now,
    );
    store.importFrom(path);
    expect(store.get().overrides).toHaveLength(0);
    const safety = readdirSync(store.backupDir).find((f) =>
      f.startsWith("before-restore-"),
    )!;
    expect(
      JSON.parse(readFileSync(join(store.backupDir, safety), "utf8")).state
        .overrides,
    ).toHaveLength(1);
  });
  it("连续启动只保留最近七份每日备份", () => {
    const store = open(),
      path = store.directory;
    store.close();
    stores.pop();
    for (let d = 1; d <= 9; d++) {
      const s = new AppStore(
        path,
        new Date(`2026-12-${String(d).padStart(2, "0")}T12:00:00+08:00`),
      );
      s.close();
    }
    const files = readdirSync(join(path, "backups")).filter((f) =>
      f.startsWith("daily-"),
    );
    expect(files).toHaveLength(7);
    expect(files).toContain("daily-2026-12-09.json");
    expect(files).not.toContain("daily-2026-12-01.json");
  });
});
