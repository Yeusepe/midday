import { existsSync } from "node:fs";

const [workspace, output = "out"] = process.argv.slice(2);
if (!workspace) throw new Error("A workspace is required");
const original = await Bun.file("bun.lock").text();
const lock = Bun.JSONC.parse(original);
const compatible = { ...lock, lockfileVersion: 1 };
delete compatible.overrides;

// shortcut: Turbo cannot parse Bun 3 override metadata; remove this when it can
await Bun.write("bun.lock", JSON.stringify(compatible));
try {
  const result = Bun.spawnSync(
    ["turbo", "prune", workspace, "--docker", `--out-dir=${output}`],
    { stdout: "inherit", stderr: "inherit" },
  );
  if (result.exitCode !== 0) throw new Error("Workspace pruning failed");
} finally {
  await Bun.write("bun.lock", original);
}

for (const path of [`${output}/bun.lock`, `${output}/json/bun.lock`, `${output}/full/bun.lock`]) {
  if (!existsSync(path)) continue;
  const pruned = Bun.JSONC.parse(await Bun.file(path).text());
  pruned.lockfileVersion = lock.lockfileVersion;
  pruned.overrides = lock.overrides;
  await Bun.write(path, JSON.stringify(pruned, null, 2));
}
