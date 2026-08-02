import { describe, expect, it } from "vitest";
import { initials, truncate } from "@/lib/format";

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
