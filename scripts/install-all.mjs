import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const servicesRoot = join(root, "services");

const services = readdirSync(servicesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const targets = [...services.map((name) => join("services", name)), "frontend"];

function run(args, cwd) {
  const result = spawnSync(npm, args, { cwd, stdio: "inherit", env: process.env });
  if (result.status !== 0) {
    throw new Error(`Command failed: npm ${args.join(" ")} (${cwd})`);
  }
}

for (const target of targets) {
  const directory = join(root, target);
  if (!existsSync(join(directory, "package.json"))) continue;
  console.log(`\n==> Installing ${target}`);
  run(["install"], directory);
}

for (const service of services) {
  const directory = join(root, "services", service);
  if (!existsSync(join(directory, "prisma", "schema.prisma"))) continue;
  const pkg = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
  if (!pkg.scripts?.["prisma:generate"]) continue;
  console.log(`\n==> Generating Prisma client for ${service}`);
  run(["run", "prisma:generate"], directory);
}

console.log("\nAll dependencies installed and Prisma clients generated.");
