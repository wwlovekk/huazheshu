import { chromium, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";

function availablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const listener = createServer();
    listener.on("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address();
      if (!address || typeof address === "string")
        return reject(new Error("Cannot reserve WebView2 test port"));
      listener.close((error) =>
        error ? reject(error) : resolve(address.port),
      );
    });
  });
}

export function desktopCommand<T = unknown>(
  page: Page,
  method: string,
  argument?: unknown,
) {
  return page.evaluate(
    ({ method, argument }) =>
      new Promise<T>((resolve, reject) => {
        const webview = (window as any).chrome.webview;
        const testWindow = window as typeof window & {
          nativeTestSequence?: number;
        };
        const id = (testWindow.nativeTestSequence =
          (testWindow.nativeTestSequence ?? 0) - 1);
        const receive = ({ data }: MessageEvent) => {
          if (data.id !== id) return;
          webview.removeEventListener("message", receive);
          if (data.error) reject(new Error(data.error));
          else resolve(data.result);
        };
        webview.addEventListener("message", receive);
        webview.postMessage({ id, method, argument });
      }),
    { method, argument },
  );
}

function stopped(child: ChildProcess) {
  return child.exitCode !== null || child.signalCode !== null;
}

export async function removeDesktopTestData(data: string) {
  // WebView2 can take a moment to release its profile after the host exits.
  await rm(data, {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: 120,
  });
}

export async function launchDesktop(data: string) {
  const port = await availablePort();
  const executable =
    process.env.HUAZHESHU_EXECUTABLE ??
    join(process.cwd(), "out", "desktop", "划着数.exe");
  const child = spawn(executable, [], {
    env: {
      ...process.env,
      HUAZHESHU_TEST: "1",
      HUAZHESHU_DATA_DIR: data,
      HUAZHESHU_CDP_PORT: String(port),
    },
    stdio: "ignore",
    windowsHide: true,
  });
  let launchError: Error | undefined;
  child.on("error", (error) => {
    launchError = error;
  });
  const deadline = Date.now() + 20000;
  try {
    while (Date.now() < deadline && !stopped(child) && !launchError) {
      const browser = await chromium
        .connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1500 })
        .catch(() => null);
      if (browser) {
        const page = browser.contexts()[0].pages()[0];
        if (page)
          return {
            page,
            async close() {
              if (stopped(child)) return;
              const exited = new Promise<void>((resolve) =>
                child.once("exit", () => resolve()),
              );
              void desktopCommand(page, "test:quit").catch(() => {});
              let timer: ReturnType<typeof setTimeout> | undefined;
              try {
                await Promise.race([
                  exited,
                  new Promise<void>((resolve) => {
                    timer = setTimeout(resolve, 4000);
                  }),
                ]);
                if (!stopped(child)) {
                  child.kill();
                  await exited;
                }
              } finally {
                if (timer) clearTimeout(timer);
                await browser.close().catch(() => {});
              }
            },
          };
        await browser.close();
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const log = ["startup-error.txt", "desktop-error.log"]
      .map((file) => join(data, file))
      .filter(existsSync)
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    throw new Error(
      `划着数启动失败 (${child.exitCode ?? launchError?.message ?? "timeout"})\n${log}`,
    );
  } catch (error) {
    if (!stopped(child)) child.kill();
    throw error;
  }
}
