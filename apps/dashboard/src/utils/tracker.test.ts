import { describe, expect, test } from "bun:test";
import { parseTimerStartTime } from "./tracker";

describe("timer start time", () => {
  const now = new Date("2026-10-15T21:30:00.000Z");

  test("uses today's date and the user's timezone for an earlier start", () => {
    const start = parseTimerStartTime("15:00", "America/Bogota", now);
    expect(start).toBe("2026-10-15T20:00:00.000Z");
    expect((now.getTime() - Date.parse(start)) / 1000).toBe(5400);
  });

  test("uses the local day when it differs from the UTC day", () => {
    expect(
      parseTimerStartTime(
        "19:00",
        "America/Bogota",
        new Date("2026-10-16T01:30:00.000Z"),
      ),
    ).toBe("2026-10-16T00:00:00.000Z");
    expect(
      parseTimerStartTime(
        "03:00",
        "Asia/Tokyo",
        new Date("2026-10-15T21:30:00.000Z"),
      ),
    ).toBe("2026-10-15T18:00:00.000Z");
  });

  test("supports UTC explicitly", () => {
    expect(parseTimerStartTime("15:00", "UTC", now)).toBe(
      "2026-10-15T15:00:00.000Z",
    );
  });

  test("rejects future times instead of interpreting them as yesterday", () => {
    expect(() => parseTimerStartTime("17:00", "America/Bogota", now)).toThrow(
      "Start time cannot be in the future",
    );
  });

  test.each([
    "",
    "24:00",
    "15:99",
    "invalid",
  ])("rejects invalid time %s", (time) => {
    expect(() => parseTimerStartTime(time, "America/Bogota", now)).toThrow(
      "Choose a valid start time",
    );
  });

  test("rejects a nonexistent time during the spring daylight saving change", () => {
    expect(() =>
      parseTimerStartTime(
        "02:30",
        "America/New_York",
        new Date("2026-03-08T10:00:00.000Z"),
      ),
    ).toThrow("Choose a valid start time");
  });
});
