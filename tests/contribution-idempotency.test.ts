import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The route's dependency graph reaches lib/db, which opens a postgres pool on import.
// Nothing here touches a real database — the query layer is stubbed per test.
vi.mock("@/lib/db", () => ({ db: {} }));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(async () => ({ id: USER_ID })),
}));

vi.mock("@/lib/db/queries/goals", () => ({
  getGoalWithDetails: vi.fn(async () => ({
    id: GOAL_ID,
    userId: USER_ID,
    kind: "financial",
    currency: "RUB",
  })),
}));

// Partial mock: the insert is stubbed, but contributionPayloadsMatch stays REAL so the
// route's replay-vs-conflict decision is exercised end to end.
vi.mock("@/lib/db/queries/contributions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/queries/contributions")>(
    "@/lib/db/queries/contributions",
  );
  return {
    ...actual,
    listContributions: vi.fn(async () => []),
    insertContributionIdempotent: vi.fn(),
  };
});

vi.mock("@/lib/analytics/events", () => ({ track: vi.fn() }));

vi.mock("@/lib/log", () => ({
  withRequestId: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const GOAL_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_GOAL_ID = "33333333-3333-4333-8333-333333333333";
const KEY = "44444444-4444-4444-8444-444444444444";

import { POST } from "@/app/api/v1/goals/[goalId]/contributions/route";
import {
  canonicalContributionPayload,
  contributionPayloadsMatch,
  insertContributionIdempotent,
} from "@/lib/db/queries/contributions";
import { shouldRotateIdempotencyKey } from "@/components/goals/quick-add-sheet";

const insertMock = vi.mocked(insertContributionIdempotent);

/** The row the server already stored under KEY: +1500.00 RUB on 2026-07-20. */
function storedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: KEY,
    goalId: GOAL_ID,
    amount: 150000n,
    note: null,
    occurredAt: "2026-07-20",
    createdAt: new Date("2026-07-20T10:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

/** A submit of that same +1500.00 payload under the same idempotency key. */
async function postContribution(body: Record<string, unknown> = {}) {
  const request = new Request(`http://localhost/api/v1/goals/${GOAL_ID}/contributions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: KEY,
      amountMinor: "150000",
      occurredAt: "2026-07-20",
      isNegative: false,
      isPreset: false,
      ...body,
    }),
  });

  const response = await POST(request, { params: Promise.resolve({ goalId: GOAL_ID }) });
  return { response, body: await response.json() };
}

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

beforeEach(() => {
  insertMock.mockReset();
});

describe("CR-014 — contribution idempotency key replay semantics", () => {
  it("returns the originally stored row for an exact replay", async () => {
    insertMock.mockResolvedValue({ status: "conflict", existing: storedRow() });

    const { response, body } = await postContribution();

    expect(response.status).toBe(200);
    expect(body.data.duplicate).toBe(true);
    // The ORIGINAL row is echoed back (not null, as the buggy version returned), so the
    // client reconciles against stored truth instead of its optimistic copy.
    expect(body.data.contribution.id).toBe(KEY);
    expect(body.data.contribution.occurredAt).toBe("2026-07-20");
  });

  it("serializes replayed bigint money as a string", async () => {
    insertMock.mockResolvedValue({ status: "conflict", existing: storedRow() });

    const { body } = await postContribution();

    expect(body.data.contribution.amount).toBe("150000");
    expect(typeof body.data.contribution.amount).toBe("string");
  });

  it("rejects a reused key carrying a different amount with 409", async () => {
    insertMock.mockResolvedValue({ status: "conflict", existing: storedRow({ amount: 999n }) });

    const { response, body } = await postContribution();

    expect(response.status).toBe(409);
    expect(body.code).toBe("idempotency_key_reused");
  });

  it("rejects a reused key carrying a different date with 409", async () => {
    insertMock.mockResolvedValue({
      status: "conflict",
      existing: storedRow({ occurredAt: "2026-07-19" }),
    });

    const { response, body } = await postContribution();

    expect(response.status).toBe(409);
    expect(body.code).toBe("idempotency_key_reused");
  });

  it("rejects a reused key bound to a different goal with 409", async () => {
    insertMock.mockResolvedValue({
      status: "conflict",
      existing: storedRow({ goalId: OTHER_GOAL_ID }),
    });

    const { response, body } = await postContribution();

    expect(response.status).toBe(409);
    expect(body.code).toBe("idempotency_key_reused");
  });

  it("rejects a reused key carrying a different note with 409", async () => {
    insertMock.mockResolvedValue({ status: "conflict", existing: storedRow({ note: "премия" }) });

    const { response, body } = await postContribution();

    expect(response.status).toBe(409);
    expect(body.code).toBe("idempotency_key_reused");
  });

  it("never treats a key it cannot see in user scope as a replay", async () => {
    // Another owner's row, a deleted goal, or a soft-deleted contribution all surface as
    // existing: null. Echoing a row back here would leak data across owners.
    insertMock.mockResolvedValue({ status: "conflict", existing: null });

    const { response, body } = await postContribution();

    expect(response.status).toBe(409);
    expect(body.code).toBe("idempotency_key_reused");
    expect(body.data).toBeUndefined();
  });

  it("still reports a fresh insert as a non-duplicate creation", async () => {
    insertMock.mockResolvedValue({ status: "created", contribution: storedRow() });

    const { response, body } = await postContribution();

    expect(response.status).toBe(200);
    expect(body.data.duplicate).toBe(false);
    expect(body.data.contribution.amount).toBe("150000");
  });

  it("404s when the goal vanished between the ownership check and the insert", async () => {
    insertMock.mockResolvedValue({ status: "goal_not_found" });

    const { response } = await postContribution();

    expect(response.status).toBe(404);
  });
});

describe("canonical contribution payload comparison", () => {
  it("treats absent and null notes as the same intent", () => {
    expect(contributionPayloadsMatch(storedRow(), storedRow({ note: undefined }))).toBe(true);
  });

  it("compares occurredAt by calendar day across Date and string forms", () => {
    const asDate = storedRow({ occurredAt: new Date("2026-07-20T23:30:00.000Z") });

    expect(canonicalContributionPayload(asDate).occurredAt).toBe("2026-07-20");
    expect(contributionPayloadsMatch(storedRow(), asDate)).toBe(true);
  });

  it("keeps money as bigint and distinguishes sign", () => {
    expect(canonicalContributionPayload(storedRow()).amount).toBe(150000n);
    expect(contributionPayloadsMatch(storedRow(), storedRow({ amount: -150000n }))).toBe(false);
  });

  it("ignores server-assigned fields that are not part of client intent", () => {
    const later = storedRow({
      createdAt: new Date("2030-01-01T00:00:00.000Z"),
      deletedAt: new Date("2030-01-02T00:00:00.000Z"),
    });

    expect(contributionPayloadsMatch(storedRow(), later)).toBe(true);
  });
});

describe("CR-025 — client idempotency key rotation contract", () => {
  it("rotates the key after a successful creation", () => {
    expect(shouldRotateIdempotencyKey("created")).toBe(true);
  });

  it("rotates the key after an exact replay (the bug: it used to pin forever)", () => {
    expect(shouldRotateIdempotencyKey("replayed")).toBe(true);
  });

  it("rotates the key after a reused-key conflict", () => {
    expect(shouldRotateIdempotencyKey("key_reused")).toBe(true);
  });

  it("keeps the key when the outcome is unknown, so a retry stays idempotent", () => {
    expect(shouldRotateIdempotencyKey("unknown")).toBe(false);
  });

  it("clears idRef on both settled paths rather than only the created path", () => {
    const client = source("components/goals/quick-add-sheet.tsx");
    const rotations = client.match(/shouldRotateIdempotencyKey\([^)]*\)\)\s*idRef\.current = null/g);

    // One in onSuccess, one in onError — the early `if (duplicate) return` that skipped
    // rotation must not come back.
    expect(rotations).toHaveLength(2);
    expect(client).not.toMatch(/if \(result\.data\.duplicate\) return;/);
  });

  it("pins the same error code string on both sides of the wire", () => {
    const code = "idempotency_key_reused";

    expect(source("app/api/v1/goals/[goalId]/contributions/route.ts")).toContain(`"${code}"`);
    expect(source("components/goals/quick-add-sheet.tsx")).toContain(`"${code}"`);
  });
});
