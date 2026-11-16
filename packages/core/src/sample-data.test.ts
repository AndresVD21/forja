// Realistic fixtures taken from docs/sample-data/README.md (the owner's notes).
// Every expected value was worked out by hand from the spec (PLAN 2.2, ARCHITECTURE 2.9b):
//   1RM = total * (1 + reps/30);  next = 1RM / (1 + target/30);  rounded DOWN to the step.
// Per-side exercises: total = 2*side + bar, maths on total, back to (total - bar)/2, then round.
import { describe, expect, it } from "vitest";
import { DEFAULT_BAR_WEIGHT } from "./barbell";
import { extendWeek, generateDefaultPlan, type PlanWeek } from "./plan";
import { epleyProposal, percentageProposal, proposeNextWeight, type ProposalInput } from "./proposal";
import { SetLogSchema, type SetLog } from "./set-log";
import { convert } from "./units";
import { defaultWeightStep, roundDownToStep, roundToNearestStep } from "./weight";
import type { Unit } from "./units";
import type { LoadMode, Weight } from "./weight";

/** One set per entry of `reps`, all at the same weight; sets from index `failureFrom` on are flagged to failure. */
function sets(value: number, unit: Unit, reps: number[], failureFrom = 0): SetLog[] {
  return reps.map((r, i) => ({ setNumber: i + 1, reps: r, weight: { value, unit }, toFailure: i >= failureFrom }));
}

function input(over: Partial<ProposalInput> & Pick<ProposalInput, "sets" | "currentWeight" | "nextTargetReps">): ProposalInput {
  const unit = over.currentWeight.unit;
  const loadMode: LoadMode = over.loadMode ?? "total";
  return { weightStep: defaultWeightStep(unit, loadMode), loadMode, barWeight: DEFAULT_BAR_WEIGHT, ...over };
}

const w = (value: number, unit: Unit = "kg"): Weight => ({ value, unit });

describe("proposals: incline barbell press (per_side, 20 kg bar, step 1.25)", () => {
  const press = (side: number, reps: number[], target: number) =>
    proposeNextWeight(
      input({ sets: sets(side, "kg", reps), currentWeight: w(side), nextTargetReps: target, loadMode: "per_side" }),
    );

  it("week 2: 20 per side, max 14 -> 8 reps", () => {
    // total 60; 1RM 60*(44/30)=88; 88/(38/30)=69.474; side (69.474-20)/2=24.737; floor to 1.25 -> 23.75
    expect(press(20, [14, 14, 14, 14], 8)).toEqual({ weight: w(23.75), method: "epley" });
  });
  it("week 7: 22.5 per side x 13 -> 6 reps", () => {
    // total 65; 1RM 65*(43/30)=93.167; /1.2=77.639; side 28.819; /1.25=23.05 -> 28.75
    expect(press(22.5, [13, 13, 13, 13], 6).weight).toEqual(w(28.75));
  });
  it("week 9: 27.5 per side x 8 -> next cycle at 10 reps, proposal goes DOWN", () => {
    // total 75; 1RM 75*(38/30)=95; 95/(40/30)=71.25; side 25.625; /1.25=20.5 -> 25
    const result = press(27.5, [8, 8, 8, 8], 10).weight;
    expect(result).toEqual(w(25));
    expect(result.value).toBeLessThan(27.5);
  });
  it("week 18 style 8-10-8-7: only flagged sets count, best of them wins", () => {
    // Sets 3 and 4 (8 and 7 reps) flagged. Set 1 (8) and 2 (10) are normal sets.
    // best flagged = 8 reps: total 75, 1RM 95; for 8 reps: 95/(38/30)=75 total -> side 27.5 exactly (22 steps)
    const logged = sets(27.5, "kg", [8, 10, 8, 7], 2);
    const result = proposeNextWeight(
      input({ sets: logged, currentWeight: w(27.5), nextTargetReps: 8, loadMode: "per_side" }),
    );
    expect(result).toEqual({ weight: w(27.5), method: "epley" });
  });
  it("8-10-8-7 with every set flagged: the 10-rep set is the best", () => {
    // 10 reps: 1RM 75*(40/30)=100; for 6 reps 100/1.2=83.333; side 31.667; /1.25=25.33 -> 31.25
    const logged = sets(27.5, "kg", [8, 10, 8, 7], 0);
    expect(
      proposeNextWeight(input({ sets: logged, currentWeight: w(27.5), nextTargetReps: 6, loadMode: "per_side" })).weight,
    ).toEqual(w(31.25));
  });
  it("picks the best set by TOTAL load, not by the per-side number", () => {
    // A: 10/side x 20: total 40, 1RM 40*(50/30)=66.67.  B: 15/side x 6: total 50, 1RM 60.
    // Per-side numbers alone would prefer B (15*1.2=18 > 10*1.667=16.67); total load prefers A.
    // A for 8 reps: 66.667/(38/30)=52.632; side 16.316; floor -> 16.25 (B would give 12.5).
    const logged: SetLog[] = [
      { setNumber: 1, reps: 20, weight: w(10), toFailure: true },
      { setNumber: 2, reps: 6, weight: w(15), toFailure: true },
    ];
    expect(
      proposeNextWeight(input({ sets: logged, currentWeight: w(10), nextTargetReps: 8, loadMode: "per_side" })).weight,
    ).toEqual(w(16.25));
  });
});

describe("proposals: total machines in kg (step 2.5)", () => {
  const machine = (value: number, reps: number, target: number) =>
    proposeNextWeight(input({ sets: sets(value, "kg", [reps, reps, reps, reps]), currentWeight: w(value), nextTargetReps: target }));

  it("Press maquina 50 x 12 -> 8", () => {
    // 1RM 50*(42/30)=70; 70/(38/30)=55.263; /2.5=22.1 -> 55
    expect(machine(50, 12, 8).weight).toEqual(w(55));
  });
  it("Pec fly 73 x 14 -> 8", () => {
    // 1RM 73*(44/30)=107.067; /1.26667=84.526; /2.5=33.8 -> 82.5
    expect(machine(73, 14, 8).weight).toEqual(w(82.5));
  });
  it("Leg press 45 x 14 -> 8", () => {
    // 1RM 66; 66*30/38=52.105; /2.5=20.8 -> 50
    expect(machine(45, 14, 8).weight).toEqual(w(50));
  });
  it("Calf extension 120 x 20 -> 8", () => {
    // 1RM 120*(50/30)=200; 200*30/38=157.895; /2.5=63.16 -> 157.5
    expect(machine(120, 20, 8).weight).toEqual(w(157.5));
  });
});

describe("proposals: lb entries stay in lb (step 5)", () => {
  it("Press maquina 135 lb x 8 -> 10 reps", () => {
    // 1RM 135*(38/30)=171; 171*0.75=128.25; /5=25.65 -> 125 lb
    const r = proposeNextWeight(input({ sets: sets(135, "lb", [8, 8, 8, 8]), currentWeight: w(135, "lb"), nextTargetReps: 10 }));
    expect(r.weight).toEqual(w(125, "lb"));
  });
  it("Pec fly 190 lb x 8 -> 10 reps", () => {
    // 1RM 190*(38/30)=240.667; *0.75=180.5; /5=36.1 -> 180 lb
    const r = proposeNextWeight(input({ sets: sets(190, "lb", [8, 8, 8, 8]), currentWeight: w(190, "lb"), nextTargetReps: 10 }));
    expect(r.weight).toEqual(w(180, "lb"));
  });
});

describe("proposals: fallback (+5 %, nearest step) when there is no failure data", () => {
  const normal = (value: number, unit: Unit) => sets(value, unit, [10, 10, 10, 10]).map((s) => ({ ...s, toFailure: false }));

  it("total kg: Pec fly 73 -> 76.65 -> 77.5", () => {
    // 73*1.05=76.65; /2.5=30.66 -> 31 -> 77.5
    expect(proposeNextWeight(input({ sets: normal(73, "kg"), currentWeight: w(73), nextTargetReps: 8 }))).toEqual({
      weight: w(77.5),
      method: "percentage",
    });
  });
  it("total kg: 50 -> 52.5 (exactly on the grid)", () => {
    expect(percentageProposal(input({ sets: [], currentWeight: w(50), nextTargetReps: 8 })).value).toBe(52.5);
  });
  it("total lb: 135 -> 141.75 -> 140", () => {
    // /5=28.35 -> 28 -> 140
    expect(proposeNextWeight(input({ sets: normal(135, "lb"), currentWeight: w(135, "lb"), nextTargetReps: 8 }))).toEqual({
      weight: w(140, "lb"),
      method: "percentage",
    });
  });
  it("per side: 20 -> total 60 -> 63 -> side 21.5 -> 21.25", () => {
    // 21.5/1.25=17.2 -> 17 -> 21.25
    const r = proposeNextWeight(input({ sets: normal(20, "kg"), currentWeight: w(20), nextTargetReps: 8, loadMode: "per_side" }));
    expect(r).toEqual({ weight: w(21.25), method: "percentage" });
  });
  it("per side: 27.5 -> total 75 -> 78.75 -> side 29.375 -> exact half step rounds up to 30", () => {
    // 29.375/1.25=23.5 -> 24 -> 30
    expect(
      percentageProposal(input({ sets: [], currentWeight: w(27.5), nextTargetReps: 8, loadMode: "per_side" })).value,
    ).toBe(30);
  });
  it("the naive +5 % on the per-side number would be wrong", () => {
    // 27.5*1.05=28.875 -> 28.75 (wrong). Correct is 30.
    expect(roundToNearestStep(27.5 * 1.05, 1.25)).toBe(28.75);
    expect(
      percentageProposal(input({ sets: [], currentWeight: w(27.5), nextTargetReps: 8, loadMode: "per_side" })).value,
    ).not.toBe(28.75);
  });
});

describe("per-side rule (CLAUDE.md rule 4)", () => {
  it("applying Epley to the per-side number gives a different, wrong answer", () => {
    // Wrong: 20*(44/30)=29.333; /(38/30)=23.158; floor 1.25 -> 22.5
    const wrong = roundDownToStep((20 * (1 + 14 / 30)) / (1 + 8 / 30), 1.25);
    expect(wrong).toBe(22.5);
    // Right (total load): 23.75
    const right = epleyProposal(
      input({ sets: sets(20, "kg", [14, 14, 14, 14]), currentWeight: w(20), nextTargetReps: 8, loadMode: "per_side" }),
    );
    expect(right.value).toBe(23.75);
    expect(right.value).not.toBe(wrong);
  });
});

describe("mixed units", () => {
  it("per-side lb sets with the bar given in kg: 35 lb/side x 10, 8 reps next", () => {
    // bar 20 kg = 44.0925 lb; total 70+44.0925=114.0925; 1RM *(40/30)=152.123; /(38/30)=120.097
    // side (120.097-44.0925)/2=38.002; floor to 2.5 -> 37.5 lb.
    // If the bar were wrongly read as 20 lb: total 90; 1RM 120; /(38/30)=94.737; side 37.368 -> 35 lb.
    const r = proposeNextWeight(
      input({ sets: sets(35, "lb", [10, 10, 10, 10]), currentWeight: w(35, "lb"), nextTargetReps: 8, loadMode: "per_side", barWeight: w(20, "kg") }),
    );
    expect(r).toEqual({ weight: w(37.5, "lb"), method: "epley" });
  });
  it("per-side lb fallback with a kg bar: 55 lb/side", () => {
    // total 110+44.0925=154.0925; *1.05=161.797; side (161.797-44.0925)/2=58.852; /2.5=23.54 -> 24 -> 60 lb.
    // If the bar were wrongly read as 20 lb: total 130; *1.05=136.5; side 58.25; /2.5=23.3 -> 23 -> 57.5 lb.
    const r = percentageProposal(
      input({ sets: [], currentWeight: w(55, "lb"), nextTargetReps: 8, loadMode: "per_side", barWeight: w(20, "kg") }),
    );
    expect(r).toEqual(w(60, "lb"));
  });
  it("sets in kg and lb in one phase: the lb set is stronger (135 lb = 61.2 kg > 60 kg) and decides", () => {
    // 135 lb x 10: 1RM 180 lb; for 8 reps 180*30/38=142.105 lb; /5=28.4 -> 140 lb.
    const logged: SetLog[] = [
      { setNumber: 1, reps: 10, weight: w(60), toFailure: true },
      { setNumber: 2, reps: 10, weight: w(135, "lb"), toFailure: true },
    ];
    const r = proposeNextWeight(input({ sets: logged, currentWeight: w(135, "lb"), nextTargetReps: 8 }));
    expect(r.weight).toEqual(w(140, "lb"));
  });
});

describe("rounding of off-grid machine weights from the notes", () => {
  it.each([
    // value, step, down, nearest   (value/step in the comment)
    [19.3, 2.5, 17.5, 20], // 7.72
    [23.4, 2.5, 22.5, 22.5], // 9.36
    [57.3, 2.5, 55, 57.5], // 22.92
    [66.4, 2.5, 65, 67.5], // 26.56
    [147.5, 5, 145, 150], // 29.5: exact half rounds up
  ])("%s with step %s -> down %s, nearest %s", (value, step, down, nearest) => {
    expect(roundDownToStep(value, step)).toBe(down);
    expect(roundToNearestStep(value, step)).toBe(nearest);
  });
  it("float noise: 22.499999999999996 is on the 2.5 grid", () => {
    expect(roundDownToStep(22.499999999999996, 2.5)).toBe(22.5);
    expect(roundDownToStep(0.1 + 0.2, 0.1)).toBe(0.3);
    expect(roundDownToStep(1.25 * 3, 1.25)).toBe(3.75);
  });
  it("values exactly on a step stay put", () => {
    expect(roundDownToStep(25, 2.5)).toBe(25);
    expect(roundToNearestStep(25, 2.5)).toBe(25);
    expect(roundDownToStep(27.5, 1.25)).toBe(27.5);
  });
  it("a value smaller than one step", () => {
    expect(roundDownToStep(1, 2.5)).toBe(0);
    expect(roundToNearestStep(1, 2.5)).toBe(0);
    expect(roundToNearestStep(1.25, 2.5)).toBe(2.5); // exact half rounds up
  });
  it("zero stays zero", () => {
    expect(roundDownToStep(0, 2.5)).toBe(0);
    expect(roundToNearestStep(0, 2.5)).toBe(0);
  });
});

describe("kg/lb pairs written in the notes", () => {
  it.each([
    [68, 150],
    [93, 205],
    [32.9, 72.5],
    [7.9, 17.5],
    [59, 130],
    [41, 90],
    [70.5, 155],
  ])("%s kg is %s lb within gym-label tolerance (0.5 kg)", (kg, lb) => {
    expect(Math.abs(convert(lb, "lb", "kg") - kg)).toBeLessThan(0.5);
    expect(Math.abs(convert(kg, "kg", "lb") - lb)).toBeLessThan(0.5 / 0.45359237);
  });
  it("kg -> lb -> kg round trip", () => {
    for (const kg of [7.9, 19.3, 32.9, 66.4, 93, 120]) {
      expect(convert(convert(kg, "kg", "lb"), "lb", "kg")).toBeCloseTo(kg, 9);
    }
  });
  it("same unit returns the exact value (no float noise)", () => {
    expect(convert(72.5, "lb", "lb")).toBe(72.5);
  });
});

describe("default plan (PLAN 2.2)", () => {
  const expected: PlanWeek[] = [
    { weekNumber: 1, phase: 1, targetReps: 10, targetSets: 4, toFailure: false },
    { weekNumber: 2, phase: 1, targetReps: 10, targetSets: 4, toFailure: true },
    { weekNumber: 3, phase: 2, targetReps: 8, targetSets: 4, toFailure: false },
    { weekNumber: 4, phase: 2, targetReps: 8, targetSets: 4, toFailure: true },
    { weekNumber: 5, phase: 3, targetReps: 6, targetSets: 4, toFailure: false },
    { weekNumber: 6, phase: 3, targetReps: 6, targetSets: 4, toFailure: true },
  ];
  it("matches the table exactly", () => {
    expect(generateDefaultPlan()).toEqual(expected);
  });
  it("returns a fresh array every call", () => {
    const a = generateDefaultPlan();
    a[0]!.targetReps = 99;
    expect(generateDefaultPlan()[0]!.targetReps).toBe(10);
  });
  it("extending the same week twice reproduces 'week 14 done three times'", () => {
    const plan = extendWeek(extendWeek(generateDefaultPlan(), 3), 3);
    expect(plan).toHaveLength(8);
    expect(plan.map((p) => p.weekNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const { weekNumber: _ignored, ...w3 } = plan[2]!;
    void _ignored;
    expect({ ...plan[3]!, weekNumber: 0 }).toEqual({ ...w3, weekNumber: 0 });
    expect({ ...plan[4]!, weekNumber: 0 }).toEqual({ ...w3, weekNumber: 0 });
    expect(w3).toEqual({ phase: 2, targetReps: 8, targetSets: 4, toFailure: false });
    // the rest shifted by two
    expect(plan.slice(5).map((p) => [p.phase, p.toFailure])).toEqual([[2, true], [3, false], [3, true]]);
  });
  it("extending a to-failure week copies the failure flag", () => {
    const plan = extendWeek(generateDefaultPlan(), 2);
    expect(plan.map((p) => p.toFailure)).toEqual([false, true, true, false, true, false, true]);
    expect(plan[2]).toEqual({ weekNumber: 3, phase: 1, targetReps: 10, targetSets: 4, toFailure: true });
  });
  it.each([0, 7, -1, 1.5])("week %s is rejected", (n) => {
    expect(() => extendWeek(generateDefaultPlan(), n)).toThrow(RangeError);
  });
  it("does not mutate its input", () => {
    const plan = Object.freeze(generateDefaultPlan().map((p) => Object.freeze({ ...p })));
    const snapshot = structuredClone(plan);
    const out = extendWeek(plan, 6);
    expect(plan).toEqual(snapshot);
    expect(out).not.toBe(plan);
    // the inserted copy is its own object
    expect(out[6]).not.toBe(out[5]);
  });
});

describe("SetLogSchema", () => {
  const valid = { setNumber: 1, reps: 10, weight: { value: 27.5, unit: "kg" }, toFailure: false };
  const ok = (v: unknown) => SetLogSchema.safeParse(v).success;

  it.each([
    [{ ...valid }],
    [{ setNumber: 4, reps: 7, weight: { value: 27.5, unit: "kg" }, toFailure: true }],
    [{ setNumber: 2, reps: 8, weight: { value: 135, unit: "lb" }, toFailure: false }],
    [{ setNumber: 3, reps: 0, weight: { value: 9999.99, unit: "kg" }, toFailure: true }],
    [{ setNumber: 1, reps: 20, weight: { value: 0, unit: "kg" }, toFailure: false }],
  ])("accepts realistic set %#", (v) => {
    expect(ok(v)).toBe(true);
  });

  it.each([
    ["negative weight", { ...valid, weight: { value: -1, unit: "kg" } }],
    ["weight above 9999.99", { ...valid, weight: { value: 10000, unit: "kg" } }],
    ["NaN weight", { ...valid, weight: { value: NaN, unit: "kg" } }],
    ["Infinity weight", { ...valid, weight: { value: Infinity, unit: "kg" } }],
    ["unit lbs", { ...valid, weight: { value: 10, unit: "lbs" } }],
    ["unit KG", { ...valid, weight: { value: 10, unit: "KG" } }],
    ["fractional reps", { ...valid, reps: 10.5 }],
    ["negative reps", { ...valid, reps: -1 }],
    ["setNumber 0", { ...valid, setNumber: 0 }],
    ["missing reps", { setNumber: 1, weight: valid.weight, toFailure: false }],
    ["missing weight", { setNumber: 1, reps: 1, toFailure: false }],
    ["missing toFailure", { setNumber: 1, reps: 1, weight: valid.weight }],
    ["string weight", { ...valid, weight: { value: "27.5", unit: "kg" } }],
  ])("rejects %s", (_name, v) => {
    expect(ok(v)).toBe(false);
  });
});
