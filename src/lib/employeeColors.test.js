import { describe, expect, it } from "vitest";
import {
  normalizeHexColor,
  pickEmployeeHexColor,
  resolveEmployeeEventColor,
  resolveEmployeeHexColor,
} from "./employeeColors";

describe("employeeColors", () => {
  it("normalizes hex colors", () => {
    expect(normalizeHexColor("#38bdf8")).toBe("#38BDF8");
    expect(normalizeHexColor("38BDF8")).toBe("#38BDF8");
    expect(normalizeHexColor("invalid")).toBeNull();
  });

  it("picks deterministic fallback colors", () => {
    const first = pickEmployeeHexColor("user-1");
    const second = pickEmployeeHexColor("user-1");
    const third = pickEmployeeHexColor("user-2");

    expect(first).toMatch(/^#[0-9A-F]{6}$/);
    expect(second).toBe(first);
    expect(third).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("prefers stored profile color for employee id", () => {
    const resolved = resolveEmployeeHexColor({
      employeeUserId: "u-1",
      employeeName: "Person One",
      employeeColorByUserId: {
        "u-1": "#f472b6",
      },
    });

    expect(resolved).toBe("#F472B6");
  });

  it("builds event token with rgba values", () => {
    const color = resolveEmployeeEventColor({
      employeeUserId: null,
      employeeName: "Noah",
      employeeColorByUserId: {},
    });

    expect(color.hex).toMatch(/^#[0-9A-F]{6}$/);
    expect(color.bg).toMatch(/^rgba\(/);
    expect(color.bgSoft).toMatch(/^rgba\(/);
    expect(color.bgStrong).toMatch(/^rgba\(/);
    expect(color.border).toMatch(/^rgba\(/);
  });
});
