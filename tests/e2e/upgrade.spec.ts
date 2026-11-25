import { expect, test } from "@playwright/test";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppStore } from "../../src/main/store";
import { addDays, dateKey } from "../../src/shared/dates";
import { desktopCommand, launchDesktop, removeDesktopTestData } from "./host";

test("轻量版直接读取旧 SQLite 数据并兼容旧备份", async () => {
  const data = mkdtempSync(join(tmpdir(), "huazheshu-upgrade-"));
  const legacy = new AppStore(data);
  const now = new Date();
  const stamp = now.toISOString();
  const today = dateKey(now);
  const note = {
    id: "legacy-note",
    title: "升级前的备忘",
    body: "内容\n第二行 🍵",
    date: today,
    pinned: true,
    createdAt: stamp,
    updatedAt: stamp,
  };
  legacy.command({ type: "note.save", value: note }, now);
  legacy.command(
    {
      type: "cross.toggle",
      date: addDays(today, -1),
      points: [
        [22, 85],
        [85, 15],
      ],
    },
    now,
  );
  const oldBackup = join(data, "legacy.json");
  legacy.exportTo(oldBackup);
  const expected = legacy.get();
  legacy.close();

  let app: Awaited<ReturnType<typeof launchDesktop>> | undefined;
  try {
    app = await launchDesktop(data);
    const page = app.page;
    await expect(page.getByLabel("当天随手记")).toHaveValue(note.body);
    await expect(
      page.getByRole("button", { name: "撤销昨天的划线", exact: true }),
    ).toBeVisible();
    const state = await page.evaluate(() => window.huazheshu.getState());
    expect(state.notes).toEqual(expected.notes);
    expect(state.crosses).toEqual(expected.crosses);
    await page.evaluate(
      (id) => window.huazheshu.command({ type: "note.delete", id }),
      note.id,
    );
    const nativeBackup = join(data, "native.json");
    await desktopCommand(page, "test:backup-export", nativeBackup);
    const corrupt = join(data, "corrupt.json");
    writeFileSync(
      corrupt,
      '{"format":"huazheshu-backup","version":1,"state":{}}',
    );
    await expect(
      desktopCommand(page, "test:backup-restore", corrupt),
    ).rejects.toThrow();
    await desktopCommand(page, "test:backup-restore", oldBackup);
    expect(
      (await page.evaluate(() => window.huazheshu.getState())).notes,
    ).toEqual(expected.notes);
    expect(
      readdirSync(join(data, "backups")).some((file) =>
        file.startsWith("before-restore-"),
      ),
    ).toBe(true);
    await app.close();
    app = undefined;

    const restoredByLegacy = new AppStore(data);
    try {
      expect(restoredByLegacy.get().crosses).toEqual(expected.crosses);
      restoredByLegacy.importFrom(nativeBackup);
      expect(restoredByLegacy.get().notes).toEqual([]);
    } finally {
      restoredByLegacy.close();
    }
  } finally {
    await app?.close();
    await removeDesktopTestData(data);
  }
});
