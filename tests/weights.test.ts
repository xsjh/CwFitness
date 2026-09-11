import { describe, expect, it } from "vitest";

import { weightFromGrams, weightInGrams } from "../lib/weights";

const GRAMS_PER_POUND = 453.59237;

describe("weightInGrams", () => {
  it("converts a Weight Unit of kilograms into grams", () => {
    expect(weightInGrams(100, "kg")).toBe(100_000);
    expect(weightInGrams(2.5, "kg")).toBe(2_500);
  });

  it("converts a Weight Unit of pounds using the international pound", () => {
    expect(weightInGrams(1, "lb")).toBe(454);
    expect(weightInGrams(10, "lb")).toBe(4_536);
  });

  it("rounds to the nearest whole gram", () => {
    expect(weightInGrams(0.5, "lb")).toBe(227);
    expect(weightInGrams(0.0015, "kg")).toBe(2);
  });

  it("rejects a weight that is not a positive finite number", () => {
    expect(weightInGrams(0, "kg")).toBeNull();
    expect(weightInGrams(-5, "kg")).toBeNull();
    expect(weightInGrams(Number.NaN, "kg")).toBeNull();
    expect(weightInGrams(Number.POSITIVE_INFINITY, "kg")).toBeNull();
  });

  it("rejects a weight that is not a number", () => {
    expect(weightInGrams("100", "kg")).toBeNull();
    expect(weightInGrams(null, "kg")).toBeNull();
    expect(weightInGrams(undefined, "kg")).toBeNull();
  });

  it("rejects a Weight Unit it does not know", () => {
    expect(weightInGrams(100, "stone")).toBeNull();
    expect(weightInGrams(100, undefined)).toBeNull();
    expect(weightInGrams(100, "KG")).toBeNull();
  });
});

describe("weightFromGrams", () => {
  it("restores a stored weight to the unit it was entered in", () => {
    expect(weightFromGrams(100_000, "kg")).toBe(100);
    expect(weightFromGrams(weightInGrams(80, "kg")!, "kg")).toBe(80);
  });

  it("keeps a pound value within one gram of where it started after a round trip", () => {
    const grams = weightInGrams(135, "lb")!;

    expect(Math.abs(weightInGrams(weightFromGrams(grams, "lb"), "lb")! - grams)).toBeLessThanOrEqual(1);
    expect(weightFromGrams(grams, "lb")).toBeCloseTo(135, 2);
  });

  it("uses the same conversion factor in both directions", () => {
    expect(weightFromGrams(GRAMS_PER_POUND, "lb")).toBe(1);
    expect(weightFromGrams(1_000, "kg")).toBe(1);
  });
});
