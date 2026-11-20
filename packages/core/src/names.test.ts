import { describe, expect, it } from "vitest";
import { namesMatch, normalizeName } from "./names";

describe("normalizeName", () => {
  it("ignores case and accents", () => {
    expect(normalizeName("Press máquina")).toBe("press maquina");
    expect(normalizeName("press  MAQUINA ")).toBe("press maquina");
    expect(normalizeName("Press maquina")).toBe("press maquina");
  });

  it("trims and collapses spaces and tabs", () => {
    expect(normalizeName("  \tPec \t fly \n")).toBe("pec fly");
  });

  it("returns an empty string for empty or blank input", () => {
    expect(normalizeName("")).toBe("");
    expect(normalizeName(" \t ")).toBe("");
  });

  it("strips the tilde of n, accepted for matching", () => {
    expect(normalizeName("Cañasgordas")).toBe("canasgordas");
  });

  it("keeps parentheses", () => {
    expect(normalizeName("Leg press (inclinado)")).toBe("leg press (inclinado)");
  });
});

describe("namesMatch", () => {
  it("matches catalogue aliases across case and accents", () => {
    expect(namesMatch("Tríceps cuerda", "triceps cuerda")).toBe(true);
    expect(namesMatch("Hip Abductor", "Hip abductor")).toBe(true);
    expect(namesMatch("Cañasgordas", "canasgordas")).toBe(true);
  });

  it("does not match different names", () => {
    expect(namesMatch("Press máquina", "Press barra")).toBe(false);
  });

  it("treats parenthesised and plain aliases as different", () => {
    expect(namesMatch("Leg press (inclinado)", "Leg press inclinado")).toBe(false);
  });
});
