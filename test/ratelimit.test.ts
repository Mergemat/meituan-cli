import { describe, expect, test } from "bun:test";
import { jointSlot, nextSlot, type Rules } from "../src/ratelimit";

const rules: Rules = {
  gapMs: 200,
  windows: [
    { limit: 3, ms: 60_000 },
    { limit: 5, ms: 3_600_000 },
  ],
};

describe("nextSlot", () => {
  test("an idle budget goes right away", () => {
    expect(nextSlot([], 1000, rules)).toBe(1000);
  });
  test("requests keep the minimum gap, including reserved future slots", () => {
    expect(nextSlot([950], 1000, rules)).toBe(1150);
    expect(nextSlot([1000, 1200], 1000, rules)).toBe(1400);
  });
  test("a full minute waits for its oldest request to age out", () => {
    expect(nextSlot([0, 10_000, 20_000], 30_000, rules)).toBe(60_000);
  });
  test("the hourly cap holds even when every minute has room", () => {
    const hour = [0, 100_000, 200_000, 300_000, 400_000];
    expect(nextSlot(hour, 500_000, rules)).toBe(3_600_000);
  });
  test("old requests no longer count", () => {
    expect(nextSlot([0, 1, 2], 4_000_000, rules)).toBe(4_000_000);
  });
});

describe("jointSlot", () => {
  const search: Rules = { gapMs: 0, windows: [{ limit: 2, ms: 60_000 }] };
  test("an endpoint's own limit can hold a request the overall budget would let through", () => {
    expect(jointSlot([], [0, 10_000], 20_000, rules, search)).toBe(60_000);
  });
  test("the slot an endpoint pushes to still keeps the overall gap", () => {
    expect(jointSlot([60_000], [0, 10_000], 20_000, rules, search)).toBe(
      60_200
    );
  });
});
