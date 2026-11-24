import { describe, expect, it } from "vitest";
import { mergeGyms } from "./gym-list";

const a = { id: "a", name: "SmartFit A" };
const b = { id: "b", name: "SmartFit B" };

describe("mergeGyms", () => {
  it("appends added gyms after the server list", () => {
    expect(mergeGyms([a], [b])).toEqual([a, b]);
  });
  it("does not list a gym twice", () => {
    expect(mergeGyms([a, b], [b, b])).toEqual([a, b]);
    expect(mergeGyms([a], [b, b])).toEqual([a, b]);
  });
  it("returns the server list when nothing was added", () => {
    expect(mergeGyms([a], [])).toEqual([a]);
  });
});
