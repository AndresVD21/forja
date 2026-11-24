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
  it("ignores an added gym the server list already has, keeping the server's order and object", () => {
    const fresh = { id: "a", name: "SmartFit A (renamed)" };
    expect(mergeGyms([b, a], [fresh])).toEqual([b, a]);
  });
  it("handles two empty lists and an empty server list", () => {
    expect(mergeGyms([], [])).toEqual([]);
    expect(mergeGyms([], [a, b])).toEqual([a, b]);
  });
  it("does not change its inputs", () => {
    const server = [a];
    const added = [b];
    mergeGyms(server, added);
    expect(server).toEqual([a]);
    expect(added).toEqual([b]);
  });
});
