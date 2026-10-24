import { describe, expect, it } from "vitest";

import { incidentTotals } from "./casualties";

describe("incidentTotals", () => {
  it("counts an incident and its updates once, at the highest toll", () => {
    expect(
      incidentTotals([
        // A fire whose death toll rose from 1 to 3 in an update.
        { rootId: "fire", deaths: 1, injured: 4 },
        { rootId: "fire", deaths: 3, injured: null },
        // A crash with injuries only, and a story that gives no numbers.
        { rootId: "crash", deaths: null, injured: 2 },
        { rootId: "theft", deaths: null, injured: null },
        { rootId: "quiet", deaths: 0, injured: 0 },
      ]),
    ).toEqual({ deaths: 3, injured: 6, incidents: 2 });
  });

  it("is zero for nothing", () => {
    expect(incidentTotals([])).toEqual({ deaths: 0, injured: 0, incidents: 0 });
  });
});
