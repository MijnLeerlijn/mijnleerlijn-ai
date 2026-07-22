import { describe, it, expect } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("joins truthy class values with a space", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("filters out false, null en undefined", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("respecteert conditionele classes", () => {
    const actief = true;
    const inactief = false;
    expect(cn("basis", actief && "actief-class", inactief && "inactief-class")).toBe("basis actief-class");
  });
});
