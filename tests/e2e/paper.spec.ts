import { expect, test } from "@playwright/test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { desktopCommand, launchDesktop, removeDesktopTestData } from "./host";
import { addDays, dateKey } from "../../src/shared/dates";

async function launch() {
  const data = mkdtempSync(join(tmpdir(), "huazheshu-paper-"));
  const app = await launchDesktop(data);
  const page = app.page;
  await expect(
    page.getByRole("group", { name: "月历", exact: true }),
  ).toBeVisible();
  return { app, page, data };
}

test("宣纸三栏在常见桌面尺寸完整显示 六行月历与便签不裁切", async () => {
  const { app, page, data } = await launch();
  try {
    const today = dateKey();
    await page.evaluate(
      async ({ today, days }) => {
        const stamp = new Date().toISOString();
        for (const [i, title] of [
          "整理本周安排",
          "提交材料",
          "买日用品",
        ].entries()) {
          await window.huazheshu.command({
            type: "task.save",
            value: {
              id: `paper-task-${i}`,
              title,
              body: "",
              date: today,
              time: `${String(10 + i * 3).padStart(2, "0")}:00`,
              remind: false,
              repeat: "none",
              endDate: null,
              completedDates: [],
              createdAt: stamp,
              updatedAt: stamp,
            },
          });
        }
        await window.huazheshu.command({
          type: "task.toggle",
          id: "paper-task-0",
          date: today,
        });
        await window.huazheshu.command({
          type: "note.save",
          value: {
            id: "paper-note",
            title: "随手记",
            body: "下班后去一趟书店\n周末和朋友吃饭\n记得带伞",
            date: today,
            pinned: false,
            createdAt: stamp,
            updatedAt: stamp,
          },
        });
        for (const date of days)
          await window.huazheshu.command({ type: "cross.toggle", date });
      },
      { today, days: [1, 2, 3, 4].map((n) => addDays(today, -n)) },
    );
    for (const [width, height] of [
      [1280, 720],
      [1600, 900],
      [1920, 1080],
    ]) {
      await desktopCommand(page, "test:size", { width, height });
      await expect
        .poll(() => page.evaluate(() => [innerWidth, innerHeight]))
        .toEqual([width, height]);
      await expect(page.locator(".month-grid")).toBeInViewport({ ratio: 1 });
      const layout = await page.evaluate(() => {
        const cells = [...document.querySelectorAll(".day-cell")].map((el) =>
          el.getBoundingClientRect(),
        );
        const note = document
          .querySelector(".sticky-note")!
          .getBoundingClientRect();
        const todayNumber = document.querySelector(
          ".day-cell.today .day-number",
        )!;
        const sidebar = document
          .querySelector(".sidebar")!
          .getBoundingClientRect();
        const right = document
          .querySelector(".day-panel")!
          .getBoundingClientRect();
        return {
          count: cells.length,
          datesAtTop: [...document.querySelectorAll(".day-cell")].every(
            (cell) =>
              cell.querySelector(".day-number")!.getBoundingClientRect().top -
                cell.getBoundingClientRect().top <
              13,
          ),
          allCellsVisible: cells.every(
            (rect) =>
              rect.left >= 0 &&
              rect.top >= 0 &&
              rect.right <= innerWidth + 1 &&
              rect.bottom <= innerHeight + 1,
          ),
          outerScroll:
            document.documentElement.scrollHeight > innerHeight + 1 ||
            document.body.scrollHeight > innerHeight + 1 ||
            document.documentElement.scrollWidth > innerWidth + 1,
          sidebarWidth: sidebar.width,
          rightWidth: right.width,
          noteHeight: note.height,
          noteVisible: note.bottom <= innerHeight + 1,
          background: getComputedStyle(document.body).backgroundColor,
          todayInk: getComputedStyle(todayNumber).color,
          todaySeal: getComputedStyle(todayNumber).backgroundColor,
          stroke: getComputedStyle(document.querySelector(".cross-svg path")!)
            .stroke,
        };
      });
      expect(layout).toMatchObject({
        count: 42,
        datesAtTop: true,
        allCellsVisible: true,
        outerScroll: false,
        sidebarWidth: 200,
        rightWidth: 310,
        noteVisible: true,
        background: "rgb(250, 249, 245)",
        todayInk: "rgb(34, 32, 29)",
        todaySeal: "rgb(217, 138, 115)",
        stroke: "rgb(158, 58, 50)",
      });
      expect(layout.noteHeight).toBeGreaterThanOrEqual(240);
      const shots = join(process.cwd(), "test-results", "paper");
      mkdirSync(shots, { recursive: true });
      await page.screenshot({
        path: join(shots, `paper-${width}x${height}.png`),
      });
    }
  } finally {
    await app.close();
    await removeDesktopTestData(data);
  }
});

test("待办回车新增和便签自动保存 切换日期及搜索不会丢草稿", async () => {
  const { app, page, data } = await launch();
  try {
    const today = dateKey(),
      tomorrow = addDays(today, 1);
    await page.getByLabel("快捷添加待办").fill("开会要带的资料");
    await page.getByLabel("快捷添加待办").press("Enter");
    await expect(
      page.getByRole("button", { name: "完成 开会要带的资料", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("快捷添加待办")).toHaveValue("");
    await expect(page.getByLabel("快捷添加待办")).toBeFocused();
    const sheet = page.getByLabel("当天随手记", { exact: true });
    await sheet.fill("第一行\n第二行");
    await expect
      .poll(() =>
        page.evaluate(
          async () => (await window.huazheshu.getState()).notes[0]?.body,
        ),
      )
      .toBe("第一行\n第二行");
    await expect(sheet).toBeFocused();
    await sheet.fill("第一行\n第二行\n切换日期前的草稿");
    await page.locator(`[data-date="${tomorrow}"]`).click();
    await expect(sheet).toHaveValue("");
    await page.locator(`[data-date="${today}"]`).click();
    await expect(sheet).toHaveValue("第一行\n第二行\n切换日期前的草稿");
    await sheet.fill("尚未等待自动保存时打开搜索");
    await page.keyboard.press("Control+k");
    await expect(page.getByLabel("搜索备忘与事项")).toBeFocused();
    await page.getByLabel("搜索备忘与事项").fill("开会");
    await expect(
      page.getByRole("button", { name: /开会要带的资料.*待办/ }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "搜索", exact: true }),
    ).not.toBeVisible();
    await expect(sheet).toHaveValue("尚未等待自动保存时打开搜索");
    await page
      .getByRole("button", { name: "编辑当前备忘", exact: true })
      .click();
    await expect(page.getByRole("dialog").getByLabel("补充几句")).toHaveValue(
      "尚未等待自动保存时打开搜索",
    );
    await page
      .getByRole("dialog")
      .getByLabel("标题", { exact: true })
      .fill("保留的编辑草稿");
    await page.keyboard.press("Control+k");
    await expect(page.getByLabel("搜索备忘与事项")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "搜索", exact: true }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("dialog").getByLabel("标题", { exact: true }),
    ).toHaveValue("保留的编辑草稿");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "关闭", exact: true })
      .click();
    await page.getByRole("button", { name: "备忘", exact: true }).click();
    await expect(page.getByLabel("备忘正文")).toHaveValue(
      "尚未等待自动保存时打开搜索",
    );
    const state = await page.evaluate(() => window.huazheshu.getState());
    expect(state.notes).toHaveLength(1);
    expect(state.notes[0].date).toBe(today);
    expect(state.tasks).toHaveLength(1);
  } finally {
    await app.close();
    await removeDesktopTestData(data);
  }
});
