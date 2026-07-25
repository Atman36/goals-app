import { beforeEach, describe, expect, it, vi } from "vitest";

// T5a — a category-level regression test: upsertReflection's onConflictDoUpdate `set`
// once shipped without `ifThenItemId`, so a same-week resave silently dropped the
// checklist-item link (see lib/db/queries/reflections.ts's own comment on the `?? null`
// idiom). Rather than assert the field list by name — which would go green again the
// next time someone adds a column to `values` but forgets it in `set` — this compares
// the two objects' key sets directly, so it catches the NEXT such omission too.
//
// This stubs the drizzle chain itself (unlike tests/reflection-if-then-step.test.ts,
// which mocks the whole @/lib/db/queries/reflections module one layer up) so the actual
// .values() / .onConflictDoUpdate().set arguments passed by upsertReflection can be
// captured and compared.
// vi.mock is hoisted above imports, so the chain it returns must be built inside
// vi.hoisted rather than as a plain top-level const (vitest errors otherwise).
const { chain, valuesArgs, setArgs } = vi.hoisted(() => {
  const valuesArgs: unknown[] = [];
  const setArgs: unknown[] = [];
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.insert = vi.fn(() => chain);
  chain.values = vi.fn((v: unknown) => {
    valuesArgs.push(v);
    return chain;
  });
  chain.onConflictDoUpdate = vi.fn((opts: { set: unknown }) => {
    setArgs.push(opts.set);
    return chain;
  });
  chain.returning = vi.fn(async () => [{}]);
  return { chain, valuesArgs, setArgs };
});

vi.mock("@/lib/db", () => ({ db: chain }));

import { upsertReflection } from "@/lib/db/queries/reflections";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WEEK_START = "2026-07-20";

beforeEach(() => {
  valuesArgs.length = 0;
  setArgs.length = 0;
  chain.insert.mockClear();
  chain.values.mockClear();
  chain.onConflictDoUpdate.mockClear();
  chain.returning.mockClear();
});

describe("T5a — upsertReflection's UPDATE set matches its INSERT values", () => {
  it("carries every optional field from values() into set(), key for key", async () => {
    const fields = {
      promised: "пробежал 3 раза",
      done: "да",
      blocked: "ничего",
      learned: "что-то новое",
      promise: "следующее обещание",
      prevOutcome: "done" as const,
      newIfThen: "Если тревога — то дыхание",
      promiseGoalId: "22222222-2222-4222-8222-222222222222",
      ifThenItemId: "77777777-7777-4777-8777-777777777777",
    };

    await upsertReflection(USER_ID, WEEK_START, fields);

    expect(valuesArgs).toHaveLength(1);
    expect(setArgs).toHaveLength(1);

    const values = valuesArgs[0] as Record<string, unknown>;
    const set = setArgs[0] as Record<string, unknown>;

    // userId/weekStart are the conflict target, not update targets — everything else
    // written on INSERT must also be written on UPDATE.
    const insertKeys = new Set(
      Object.keys(values).filter((key) => key !== "userId" && key !== "weekStart"),
    );
    const updateKeys = new Set(Object.keys(set));

    expect(updateKeys).toEqual(insertKeys);
  });
});
