import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const executable = fileURLToPath(
  new URL("../out/desktop/划着数.exe", import.meta.url),
);
const child = spawn(executable, [], { detached: true, stdio: "ignore" });
child.on("error", (error) => {
  console.error("无法打开划着数 请先运行 pnpm build", error.message);
  process.exitCode = 1;
});
child.unref();
