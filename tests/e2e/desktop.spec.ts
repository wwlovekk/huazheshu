import { expect, test } from "@playwright/test";
import { mkdtempSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { desktopCommand, launchDesktop, removeDesktopTestData } from "./host";
import { dateKey, addDays } from "../../src/shared/dates";
test("桌面全流程：新增、完成、排期、笔迹、重启、缩放", async () => {
  const data = mkdtempSync(join(tmpdir(), "huazheshu-e2e-")),
    today = dateKey(),
    yesterday = addDays(today, -1),
    shots = join(process.cwd(), "test-results", "screenshots");
  mkdirSync(shots, { recursive: true });
  const launch = () => launchDesktop(data);
  let app = await launch();
  try {
    let page = app.page;
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await expect(
      page.getByRole("heading", { name: /月.*日\s*星期/ }),
    ).toBeVisible();
    await expect(page.locator(".month-grid")).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: join(shots, "01-home.png"), fullPage: true });
    await page.getByRole("button", { name: "记一笔", exact: true }).click();
    await expect(page.getByLabel("标题", { exact: true })).toBeFocused();
    await page.getByLabel("标题", { exact: true }).fill("给朋友买生日礼物");
    await page.getByRole("button", { name: "好记下了" }).click();
    await expect(
      page.getByRole("button", { name: "完成 给朋友买生日礼物", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "完成 给朋友买生日礼物", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "取消完成 给朋友买生日礼物",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "划掉昨天", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "撤销昨天的划线", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        async (d) =>
          (await window.huazheshu.getState()).crosses.some((c) => c.id === d),
        yesterday,
      ),
    ).toBe(true);
    const dragDate = addDays(today, -2),
      dragCell = page.locator(`[data-date="${dragDate}"]`);
    if ((await dragCell.count()) === 0)
      await page.getByRole("button", { name: "上个月", exact: true }).click();
    const rect = await dragCell.boundingBox();
    expect(rect).not.toBeNull();
    await page.mouse.move(
      rect!.x + rect!.width * 0.18,
      rect!.y + rect!.height * 0.75,
    );
    await page.mouse.down();
    await page.mouse.move(
      rect!.x + rect!.width * 0.82,
      rect!.y + rect!.height * 0.2,
      { steps: 9 },
    );
    await page.mouse.up();
    await expect
      .poll(() =>
        page.evaluate(
          async (d) =>
            (await window.huazheshu.getState()).crosses.find((c) => c.id === d)
              ?.points.length ?? 0,
          dragDate,
        ),
      )
      .toBeGreaterThan(2);
    await page.getByRole("button", { name: "今天", exact: true }).click();
    await page.getByRole("button", { name: "记一笔", exact: true }).click();
    await page.getByLabel("标题", { exact: true }).fill("整理书架");
    await page.getByRole("dialog").locator("input[type=date]").first().fill("");
    await page.getByRole("button", { name: "好记下了" }).click();
    await page
      .getByRole("button", { name: "整理书架 随时", exact: true })
      .click();
    await expect(
      page.getByRole("dialog").locator("input[type=date]").first(),
    ).toHaveValue("");
    await page.getByRole("button", { name: "好记下了" }).click();
    await page.getByRole("button", { name: "新增备忘", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("标题", { exact: true }).fill("周末想做的事");
    await dialog.getByLabel("补充几句").fill("去公园散步\n读完一本书");
    await dialog.getByRole("button", { name: "好记下了" }).click();
    await expect(dialog).not.toBeVisible();
    await page
      .getByRole("navigation", { name: "主导航" })
      .getByRole("button", { name: "备忘", exact: true })
      .click();
    await page.getByRole("button", { name: /周末想做的事/ }).click();
    await expect(page.getByLabel("备忘正文")).toHaveValue(
      "去公园散步\n读完一本书",
    );
    await page
      .getByLabel("备忘正文")
      .fill("去公园散步\n读完一本书\n记得带相机");
    await expect(
      page.getByText("所有修改已保存", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: join(shots, "02-notes.png"),
      fullPage: true,
    });
    await page
      .getByRole("navigation", { name: "主导航" })
      .getByRole("button", { name: "排期", exact: true })
      .click();
    await page.getByRole("button", { name: "循环排班", exact: true }).click();
    await page.getByRole("button", { name: "上四休二", exact: true }).click();
    await page.getByRole("button", { name: "保存我的作息" }).click();
    await expect(
      page.getByRole("button", { name: "作息已保存" }),
    ).toBeVisible();
    await page.screenshot({
      path: join(shots, "03-schedule.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "新增假期区间", exact: true })
      .click();
    await page.getByLabel("这段日子的名字").fill("寒假");
    await page.getByLabel("开始日期", { exact: true }).fill("2027-01-20");
    await page.getByLabel("结束日期", { exact: true }).fill("2027-02-20");
    await page.getByRole("button", { name: "保存安排", exact: true }).click();
    await expect(
      page.getByRole("button", { name: /寒假.*2027-01-20/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "重要日期", exact: true }).click();
    await page.getByRole("button", { name: "添加日期", exact: true }).click();
    await page.getByLabel("标题", { exact: true }).fill("妈妈的生日");
    await page.getByLabel("历法").selectOption("lunar");
    await page.getByRole("button", { name: "好记下了" }).click();
    await expect(
      page.getByRole("heading", { name: "妈妈的生日" }),
    ).toBeVisible();
    await page.screenshot({
      path: join(shots, "04-special-dates.png"),
      fullPage: true,
    });
    await app.close();
    app = await launch();
    page = app.page;
    await expect(
      page.getByRole("button", { name: "撤销昨天的划线", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "取消完成 给朋友买生日礼物",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /妈妈的生日/ }),
    ).toBeVisible();
    await page.keyboard.press("Control+k");
    await page.getByLabel("搜索备忘与事项").fill("周末");
    await expect(
      page.getByRole("button", { name: /周末想做的事.*备忘/ }),
    ).toBeVisible();
    await page.getByLabel("搜索备忘与事项").fill("");
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "搜索", exact: true }),
    ).not.toBeVisible();
    const unzoomedWidth = await page.evaluate(() => innerWidth);
    await desktopCommand(page, "test:zoom", 1.25);
    await expect
      .poll(() => page.evaluate(() => innerWidth))
      .toBeLessThan(unzoomedWidth);
    await page.screenshot({ path: join(shots, "05-scale-125.png") });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    await removeDesktopTestData(data);
  }
});

test("安装版关闭窗口后仍能提醒，系统接收通知且重复唤醒不重发", async () => {
  test.skip(
    !process.env.HUAZHESHU_EXECUTABLE,
    "安装包构建并安装后执行原生通知验证",
  );
  const data = mkdtempSync(join(tmpdir(), "huazheshu-notification-"));
  const app = await launchDesktop(data);
  try {
    const page = app.page;
    await expect(
      page.getByRole("heading", { name: /月.*日\s*星期/ }),
    ).toBeVisible();
    const now = new Date();
    const title = `划着数 · 托盘提醒验证 ${now.getTime()}`;
    await page.evaluate(
      async ({ date, time, stamp, title }) =>
        window.huazheshu.command({
          type: "task.save",
          value: {
            id: "native-reminder-test",
            title,
            body: "",
            date,
            time,
            repeat: "none",
            remind: true,
            endDate: null,
            completedDates: [],
            createdAt: stamp,
            updatedAt: stamp,
          },
        }),
      {
        date: dateKey(now),
        title,
        time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
        stamp: now.toISOString(),
      },
    );
    await desktopCommand(page, "test:hide");
    expect(await desktopCommand(page, "test:visible")).toBe(false);
    await desktopCommand(page, "test:reminders");
    await expect
      .poll(() => desktopCommand<string[]>(page, "test:toast-history"), {
        timeout: 15000,
      })
      .toContain(title);
    await desktopCommand(page, "test:reminders");
    await desktopCommand(page, "test:reminders");
    const state = await page.evaluate(() => window.huazheshu.getState());
    expect(
      state.deliveries.filter((d) => d.targetId === "native-reminder-test"),
    ).toHaveLength(1);
    expect(
      state.deliveries.find((d) => d.targetId === "native-reminder-test")
        ?.failed,
    ).toBe(false);
  } finally {
    await app.close();
    await removeDesktopTestData(data);
  }
});
