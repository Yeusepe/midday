import { expect, test } from "bun:test";
import merge from "deepmerge";

test("deepmerge keeps attacker-controlled keys from changing returned prototypes", () => {
  const payload = JSON.parse('{"__proto__":{"admin":true}}');
  for (const result of [merge(Object.create(null), payload), merge(payload, { safe: true })]) {
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect((result as Record<string, unknown>).admin).toBeUndefined();
  }
  const nested = merge({ session: null }, { session: payload });
  expect(Object.getPrototypeOf(nested.session)).toBe(Object.prototype);
  expect((nested.session as Record<string, unknown>).admin).toBeUndefined();
  expect(({} as Record<string, unknown>).admin).toBeUndefined();
});

test("deepmerge preserves arrays, symbols, and custom merge hooks", () => {
  const symbol = Symbol("key");
  const target = { values: [1], nested: { left: true }, [symbol]: "kept" };
  expect(merge(target, { values: [2], nested: { right: true } })).toEqual({
    values: [1, 2], nested: { left: true, right: true }, [symbol]: "kept",
  });
  expect(merge({ value: [1] }, { value: [2] }, { customMerge: (key) => key === "value" ? (_target, source) => source : undefined })).toEqual({ value: [2] });
});
