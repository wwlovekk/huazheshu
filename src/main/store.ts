import { DatabaseSync } from "node:sqlite";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { defaultState } from "../shared/engine";
import { applyCommand } from "../shared/commands";
import { dateKey } from "../shared/dates";
import { stateSchema } from "../shared/validation";
import type { AppState, Command } from "../shared/types";

export class AppStore {
  private db: DatabaseSync;
  readonly backupDir: string;
  constructor(
    readonly directory: string,
    now = new Date(),
  ) {
    mkdirSync(directory, { recursive: true });
    this.backupDir = join(directory, "backups");
    mkdirSync(this.backupDir, { recursive: true });
    this.db = new DatabaseSync(join(directory, "huazheshu.sqlite"));
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
    const version = (
      this.db.prepare("PRAGMA user_version").get() as { user_version: number }
    ).user_version;
    if (version > 1) throw new Error("数据来自更新版本，请安装新版划着数。");
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL); PRAGMA user_version=1;",
    );
    if (!this.db.prepare("SELECT id FROM app_state WHERE id=1").get())
      this.write(defaultState(now));
    stateSchema.parse(this.get());
    const dailyPath = join(this.backupDir, `daily-${dateKey(now)}.json`);
    if (!existsSync(dailyPath)) {
      this.exportTo(dailyPath);
      const files = readdirSync(this.backupDir)
        .filter((f) => /^daily-\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .sort()
        .reverse();
      for (const file of files.slice(7)) unlinkSync(join(this.backupDir, file));
    }
  }
  get(): AppState {
    const row = this.db
      .prepare("SELECT data FROM app_state WHERE id=1")
      .get() as { data: string };
    return JSON.parse(row.data) as AppState;
  }
  write(state: AppState): void {
    this.db
      .prepare(
        "INSERT INTO app_state(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      )
      .run(JSON.stringify(state));
  }
  command(raw: Command, now = new Date()): AppState {
    const state = applyCommand(this.get(), raw, now, randomUUID);
    this.write(state);
    return state;
  }
  exportTo(path: string): void {
    writeFileSync(
      path,
      JSON.stringify(
        {
          format: "huazheshu-backup",
          version: 1,
          exportedAt: new Date().toISOString(),
          state: this.get(),
        },
        null,
        2,
      ),
      "utf8",
    );
  }
  importFrom(path: string): void {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (raw?.format !== "huazheshu-backup" || raw.version !== 1)
      throw new Error("这不是支持的划着数备份文件");
    const state = stateSchema.parse(raw.state) as AppState;
    this.exportTo(join(this.backupDir, `before-restore-${Date.now()}.json`));
    state.lastReminderCheck = new Date().toISOString();
    this.write(state);
  }
  close(): void {
    this.db.close();
  }
}
