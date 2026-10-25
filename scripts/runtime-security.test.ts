import { expect, test } from "bun:test";

// Upstream regression fixture from sindresorhus/file-type commit 319abf871b50.
const malformedAsf = "3026b2758e66cf11a6d9000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
for (const module of ["file-type", "officeparser/node_modules/file-type", "ibm-cloud-sdk-core/node_modules/file-type"]) {
  test(`${module} handles malformed ASF without hanging`, () => {
    const result = Bun.spawnSync([process.execPath, "-e", `const m = await import(${JSON.stringify(module)}); const f = m.fileTypeFromBuffer || m.default.fromBuffer; console.log(JSON.stringify(await f(Buffer.from(${JSON.stringify(malformedAsf)}, "hex"))));`], { timeout: 3000 });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout.toString())).toEqual({ ext: "asf", mime: "application/vnd.ms-asf" });
  });
}
