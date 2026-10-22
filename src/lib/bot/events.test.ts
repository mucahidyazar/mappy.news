import { describe, expect, it } from "vitest";

import { errorMessage } from "./events";

describe("errorMessage", () => {
  it("names the fields a model answer got wrong instead of repeating the answer", () => {
    const validation = Object.assign(new Error(`Type validation failed: Value: {"title":"${"x".repeat(400)}"}.`), {
      cause: { issues: [{ path: ["location", "mention"], message: "Invalid input: expected string, received null" }] },
    });
    const error = Object.assign(new Error("No object generated: response did not match schema."), { cause: validation });
    expect(errorMessage(error)).toBe("No object generated: response did not match schema. (location.mention: Invalid input: expected string, received null)");
  });

  it("keeps the first line of other errors and hides bearer tokens", () => {
    const error = Object.assign(new Error("Request failed\nstack"), { cause: new Error("Authorization: Bearer abc.def-123 rejected") });
    expect(errorMessage(error)).toBe("Request failed (Authorization: Bearer *** rejected)");
  });
});
