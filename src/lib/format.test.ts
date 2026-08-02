import { describe, expect, it } from "vitest";
import { compactNumber, initials, truncate } from "@/lib/format";

describe("initials", () => {
  it("returns ? for empty input", () => {
    expect(initials(null)).toBe("?");
    expect(initials("")).toBe("?");
  });

  it("takes first two letters of a single word", () => {
    expect(initials("Stratechery")).toBe("ST");
  });

  it("takes first letter of first and last word for multi-word names", () => {
    expect(initials("Ben Thompson")).toBe("BT");
    expect(initials("The New York Times")).toBe("TT");
  });
});

describe("truncate", () => {
  it("returns short text unchanged", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates long text with an ellipsis", () => {
    expect(truncate("hello world", 5)).toBe("hello…");
  });

  it("handles null/undefined", () => {
    expect(truncate(null, 5)).toBe("");
    expect(truncate(undefined, 5)).toBe("");
  });
});

describe("compactNumber", () => {
  it("abbreviates thousands, millions and billions", () => {
    expect(compactNumber(950)).toBe("950");
    expect(compactNumber(8_097)).toBe("8.1K");
    expect(compactNumber(5_600_000)).toBe("5.6M");
    expect(compactNumber(35_600_000)).toBe("35.6M");
    expect(compactNumber(2_000_000_000)).toBe("2B");
  });

  it("drops a trailing .0 rather than printing 5.0M", () => {
    expect(compactNumber(2_000_000)).toBe("2M");
    expect(compactNumber(1_000)).toBe("1K");
  });

  it("renders an em dash for a missing count", () => {
    expect(compactNumber(null)).toBe("—");
    expect(compactNumber(undefined)).toBe("—");
  });
});
