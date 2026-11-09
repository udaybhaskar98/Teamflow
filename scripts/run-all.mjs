import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const script = process.argv[2] || "typecheck";
const allowed = new Set(["typecheck", "test", "build"]);

if (!allowed.has(script)) {
  console.error(`Unknown script "${script}". Expected one of: ${[...allowed].join(", ")}`);
  process.exit(1);
}

const servicesRoot = join(root, "services");
const services = readdirSync(servicesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const targets = [...services.map((name) => join("services", name)), "frontend"];
const failures = [];

for (const target of targets) {
  const directory = join(root, target);
  const packageFile = join(directory, "package.json");
  if (!existsSync(packageFile)) continue;
  const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
  if (!pkg.scripts?.[script]) continue;

  console.log(`\n==> ${script}: ${target}`);
  const result = spawnSync(npm, ["run", script], {
    cwd: directory,
    stdio: "inherit",
    env: process.env
  });
  if (result.status !== 0) failures.push(target);
}

if (failures.length > 0) {
  console.error(`\n${script} failed for: ${failures.join(", ")}`);
  process.exit(1);
}

console.log(`\n${script} passed for all ${targets.length} packages.`);
