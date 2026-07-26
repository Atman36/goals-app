import { describe, expect, it } from "vitest";

import {
  HOME_GOAL_ROWS,
  homeBlocks,
  orderHomeGoalRows,
  shouldShowAdjustmentNode,
  type HomeBlocksInput,
} from "@/lib/utils/home-blocks";

// Home redesign B3. The design mockup shipped six screen states as an `enum`,
// and they exclude each other by construction: «возвращение» forces "no promise
// this week", «незакрытая неделя» forces "day not marked". Real days do not
// behave like that. This file exists to pin the combinations the mockup made
// impossible to draw — if the page ever regresses to a switch over a screen
// state, these are the cases that break.

function blocks(over: Partial<HomeBlocksInput> = {}) {
  return homeBlocks({
    hasGoals: true,
    hasFocusGoal: true,
    checkedInToday: false,
    rhythmVisible: true,
    returnedAfterGap: false,
    hasCurrentPromise: true,
    hasUnclosedPromise: false,
    ...over,
  });
}

describe("homeBlocks — the day card's mode", () => {
  it("invites creating a first goal when there are none (B6)", () => {
    expect(blocks({ hasGoals: false }).dayCard).toBe("no-goals");
  });

  it("asks for a цель №1 when goals exist but none is the focus", () => {
    expect(blocks({ hasFocusGoal: false }).dayCard).toBe("pick-focus");
  });

  it("asks about the day when the focus goal is not yet marked", () => {
    expect(blocks({ checkedInToday: false }).dayCard).toBe("ask");
  });

  it("shows the recorded outcome once the day is marked", () => {
    expect(blocks({ checkedInToday: true }).dayCard).toBe("recorded");
  });
});

describe("homeBlocks — combinations the mockup's enum could not express", () => {
  // Mockup states 05 + 06. State 05 forced «обещания на неделю нет», so this
  // pairing was undrawable — yet somebody back after three weeks almost
  // certainly has last week's promise still open.
  it("shows the return block and the unclosed week at the same time (05+06)", () => {
    const result = blocks({ returnedAfterGap: true, hasUnclosedPromise: true });

    expect(result.showReturnBlock).toBe(true);
    expect(result.showUnclosedPromise).toBe(true);
  });

  // Mockup states 03 + 06. State 06 forced «день не отмечен».
  it("keeps the unclosed week visible on an already-marked day (03+06)", () => {
    const result = blocks({ checkedInToday: true, hasUnclosedPromise: true });

    expect(result.dayCard).toBe("recorded");
    expect(result.showUnclosedPromise).toBe(true);
  });

  it("keeps the return block on a day that is already marked", () => {
    expect(blocks({ returnedAfterGap: true, checkedInToday: true }).showReturnBlock).toBe(true);
  });

  // The activity that ended the gap may have been a contribution or a
  // reflection, neither of which needs a цель №1.
  it("shows the return block with no focus goal, but offers nothing to switch", () => {
    const result = blocks({ returnedAfterGap: true, hasFocusGoal: false });

    expect(result.showReturnBlock).toBe(true);
    expect(result.showFocusSwitchLine).toBe(false);
  });

  it("offers the focus switch on a return when there is a focus goal", () => {
    expect(blocks({ returnedAfterGap: true, hasFocusGoal: true }).showFocusSwitchLine).toBe(true);
  });

  it("tracks the unclosed promise independently of everything else", () => {
    expect(blocks({ hasGoals: false, hasUnclosedPromise: true }).showUnclosedPromise).toBe(true);
  });
});

describe("homeBlocks — day zero and the empty product (C1, B6)", () => {
  // Four empty cells read as a scale the person failed to fill — exactly the
  // reproach the rolling window was introduced to remove. So on day zero the
  // «Неделя» block is not drawn at all rather than drawn empty.
  it("draws no week block and no rhythm on day zero", () => {
    const result = blocks({ rhythmVisible: false, hasCurrentPromise: false });

    expect(result.showWeekBlock).toBe(false);
    expect(result.showRhythm).toBe(false);
  });

  it("still draws the week block when a promise exists but the rhythm does not", () => {
    const result = blocks({ rhythmVisible: false, hasCurrentPromise: true });

    expect(result.showWeekBlock).toBe(true);
    expect(result.showRhythm).toBe(false);
  });

  it("draws neither side panel nor the return block when there are no goals", () => {
    const result = blocks({
      hasGoals: false,
      returnedAfterGap: true,
      hasCurrentPromise: true,
      rhythmVisible: true,
    });

    expect(result.showWeekBlock).toBe(false);
    expect(result.showGoalsBlock).toBe(false);
    expect(result.showReturnBlock).toBe(false);
    // Every field means "this is on screen". Archiving the last active goal
    // leaves the week itself active, so rhythmVisible stays true — but there is
    // no block left to draw the bars in.
    expect(result.showRhythm).toBe(false);
  });

  it("draws the goals block whenever there are goals", () => {
    expect(blocks({ hasGoals: true }).showGoalsBlock).toBe(true);
  });
});

describe("shouldShowAdjustmentNode", () => {
  it("asks after an honest «частично»", () => {
    expect(shouldShowAdjustmentNode({ outcome: "partial", prompted: true })).toBe(true);
  });

  // B7. The mockup shows state 04 unconditionally, but shouldPromptAdjustment
  // mutes the node for 72 hours after the previous adjustment. Under that
  // cooldown a «частично» day ends at the recorded outcome, like a «сделал» one.
  it("stays silent under the 72-hour cooldown", () => {
    expect(shouldShowAdjustmentNode({ outcome: "partial", prompted: false })).toBe(false);
  });

  it("asks after «не сегодня»", () => {
    expect(shouldShowAdjustmentNode({ outcome: "skipped", prompted: true })).toBe(true);
  });

  it("never asks a completed day what went wrong", () => {
    expect(shouldShowAdjustmentNode({ outcome: "done", prompted: true })).toBe(false);
  });

  it("never asks when the day is not marked at all", () => {
    expect(shouldShowAdjustmentNode({ outcome: null, prompted: true })).toBe(false);
  });
});

describe("orderHomeGoalRows", () => {
  const six = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id }));

  it("hoists the focus goal to the front even from last place", () => {
    const { rows } = orderHomeGoalRows(six, "f");

    expect(rows[0].id).toBe("f");
  });

  it("keeps the incoming order when there is no focus goal", () => {
    const { rows } = orderHomeGoalRows(six, null);

    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c", "d", "e"].slice(0, HOME_GOAL_ROWS));
  });

  it("loses nothing when the focus id names a goal that is not in the list", () => {
    const three = six.slice(0, 3);
    const { rows, hiddenCount } = orderHomeGoalRows(three, "not-here");

    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(hiddenCount).toBe(0);
  });

  it("caps at four rows and reports the remainder", () => {
    const { rows, hiddenCount } = orderHomeGoalRows(six, null);

    expect(rows).toHaveLength(4);
    expect(hiddenCount).toBe(2);
  });

  it("hides nothing when the list already fits", () => {
    expect(orderHomeGoalRows(six.slice(0, 4), null).hiddenCount).toBe(0);
    expect(orderHomeGoalRows(six.slice(0, 2), null).hiddenCount).toBe(0);
  });

  it("honours an explicit limit", () => {
    const { rows, hiddenCount } = orderHomeGoalRows(six, null, 2);

    expect(rows).toHaveLength(2);
    expect(hiddenCount).toBe(4);
  });

  it("never duplicates the focus goal while hoisting it", () => {
    const { rows } = orderHomeGoalRows(six, "c");
    const ids = rows.map((r) => r.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("c");
  });

  it("shows four rows by default", () => {
    expect(HOME_GOAL_ROWS).toBe(4);
  });
});
