import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { useMetricsFilterStore } from "./metrics-filter";

const storage = new Map<string, string>();
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);

beforeAll(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
});

afterAll(() => {
  for (const [name, descriptor] of [
    ["window", originalWindow],
    ["localStorage", originalStorage],
  ] as const) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

beforeEach(() => {
  storage.clear();
  useMetricsFilterStore.setState(useMetricsFilterStore.getInitialState(), true);
});

describe("report currency preferences", () => {
  test("restores any selected currency and the existing date and revenue filters", () => {
    const store = useMetricsFilterStore.getState();
    store.initialize("team-a");
    store.setDateRange("2024-01-01", "2024-06-30");
    store.setRevenueType("gross");
    store.setCurrency("JPY");
    useMetricsFilterStore.setState(
      useMetricsFilterStore.getInitialState(),
      true,
    );
    useMetricsFilterStore.getState().initialize("team-a");
    expect(useMetricsFilterStore.getState()).toMatchObject({
      currency: "JPY",
      period: "custom",
      revenueType: "gross",
      customFrom: "2024-01-01",
      customTo: "2024-06-30",
    });
  });

  test("falls back from obsolete stored period and revenue values", () => {
    storage.set(
      "metrics-filter-preferences-team-a",
      JSON.stringify({
        period: "obsolete-period",
        revenueType: "obsolete-revenue",
        currency: "EUR",
      }),
    );
    useMetricsFilterStore.getState().initialize("team-a");
    expect(useMetricsFilterStore.getState()).toMatchObject({
      period: "1-year",
      revenueType: "net",
      currency: "EUR",
    });
  });

  test("restores the supported this-year period", () => {
    storage.set(
      "metrics-filter-preferences-team-a",
      JSON.stringify({
        period: "this-year",
        revenueType: "gross",
        currency: "CRC",
      }),
    );
    useMetricsFilterStore.getState().initialize("team-a");
    expect(useMetricsFilterStore.getState()).toMatchObject({
      period: "this-year",
      revenueType: "gross",
      currency: "CRC",
    });
  });

  test("keeps currency choices isolated between teams", () => {
    const store = useMetricsFilterStore.getState();
    store.initialize("team-a");
    store.setCurrency("CRC");
    store.initialize("team-b");
    expect(useMetricsFilterStore.getState().currency).toBeNull();
    store.setCurrency("EUR");
    store.initialize("team-a");
    expect(useMetricsFilterStore.getState().currency).toBe("CRC");
  });

  test("persists returning to the team's base currency", () => {
    const store = useMetricsFilterStore.getState();
    store.initialize("team-a");
    store.setCurrency("USD");
    store.setCurrency(null);
    store.loadFromStorage("team-a");
    expect(useMetricsFilterStore.getState().currency).toBeNull();
  });
});
