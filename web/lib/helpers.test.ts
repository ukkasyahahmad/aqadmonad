import { describe, expect, it } from "vitest";
import { nickname } from "./nickname";
import { formatClock, secondsLeft } from "./time";
import { logRanges } from "./logs";

const A = "0x7a3f00000000000000000000000000000000c219" as const;
const B = "0x1b2c0000000000000000000000000000000000aa" as const;

describe("nickname", () => {
  it("is stable for the same address", () => {
    expect(nickname(A)).toBe(nickname(A));
  });
  it("looks like Word-NN", () => {
    expect(nickname(A)).toMatch(/^[A-Z][a-z]+-\d{2}$/);
  });
  it("differs for different addresses", () => {
    expect(nickname(A)).not.toBe(nickname(B));
  });
});

describe("secondsLeft", () => {
  it("counts down from block time plus elapsed local time", () => {
    expect(secondsLeft(1000, 990, 0, 4000)).toBe(6);
  });
  it("never goes below zero", () => {
    expect(secondsLeft(1000, 990, 0, 20000)).toBe(0);
  });
  it("ignores a wrong local clock (only elapsed time matters)", () => {
    expect(secondsLeft(1000, 990, 5e12, 5e12 + 1000)).toBe(9);
  });
});

describe("formatClock", () => {
  it("formats m:ss rounding seconds up", () => {
    expect(formatClock(9.2)).toBe("0:10");
    expect(formatClock(60)).toBe("1:00");
    expect(formatClock(0)).toBe("0:00");
  });
});

describe("logRanges", () => {
  it("splits into inclusive chunks", () => {
    expect(logRanges(0n, 250n)).toEqual([
      [0n, 99n],
      [100n, 199n],
      [200n, 250n],
    ]);
  });
  it("handles a single block", () => {
    expect(logRanges(5n, 5n)).toEqual([[5n, 5n]]);
  });
});
