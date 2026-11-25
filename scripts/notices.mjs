import { createRequire } from "node:module";
import { readFileSync, existsSync, writeFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const packages = [
  "react",
  "react-dom",
  "lucide-react",
  "lunar-typescript",
  "zod",
];
const entries = [];
for (const name of packages) {
  const path = realpathSync(
    join(process.cwd(), "node_modules", name, "package.json"),
  );
  const root = dirname(path),
    pkg = JSON.parse(readFileSync(path, "utf8"));
  const license = [
    "LICENSE",
    "LICENSE.md",
    "LICENSE.txt",
    "LICENSE-MIT",
    "license",
  ]
    .map((f) => join(root, f))
    .find(existsSync);
  entries.push(
    `${pkg.name} ${pkg.version} (${pkg.license})\n${pkg.homepage || pkg.repository?.url || ""}\n${license ? readFileSync(license, "utf8") : "See the license distributed with this package."}`,
  );
  if (name === "react-dom") {
    const schedulerPath = createRequire(path).resolve("scheduler/package.json"),
      schedulerRoot = dirname(schedulerPath);
    const scheduler = JSON.parse(readFileSync(schedulerPath, "utf8"));
    entries.push(
      `scheduler ${scheduler.version}\n${readFileSync(join(schedulerRoot, "LICENSE"), "utf8")}`,
    );
  }
}
writeFileSync(
  "THIRD_PARTY_NOTICES.txt",
  "划着数 — Third-party notices\n\n" +
    entries.join("\n\n" + "=".repeat(72) + "\n\n"),
);
console.log("Generated THIRD_PARTY_NOTICES.txt");
