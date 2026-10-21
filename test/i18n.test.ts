import { describe, expect, it } from "vitest";

import en from "../messages/en.json";
import tr from "../messages/tr.json";

type Messages = { [key: string]: string | Messages };

function flatten(messages: Messages, prefix = ""): Map<string, string> {
  const entries = new Map<string, string>();
  for (const [key, value] of Object.entries(messages)) {
    if (typeof value === "string") entries.set(prefix + key, value);
    else for (const [nested, text] of flatten(value, `${prefix}${key}.`)) entries.set(nested, text);
  }
  return entries;
}

/** Top-level ICU arguments of a message ("{count, plural, …}" → count), ignoring nested plural branches. */
function argumentsOf(message: string): string[] {
  const names = new Set<string>();
  let depth = 0;
  for (let index = 0; index < message.length; index += 1) {
    const char = message[index];
    if (char === "{") {
      if (depth === 0) {
        const match = /^\{\s*([a-zA-Z0-9_]+)/.exec(message.slice(index));
        if (match) names.add(match[1]!);
      }
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
    }
  }
  return [...names].sort();
}

const trEntries = flatten(tr as Messages);
const enEntries = flatten(en as Messages);

describe("messages", () => {
  it("have the same keys in Turkish and English", () => {
    expect([...enEntries.keys()].filter((key) => !trEntries.has(key))).toEqual([]);
    expect([...trEntries.keys()].filter((key) => !enEntries.has(key))).toEqual([]);
  });

  it("use the same arguments in both languages", () => {
    const mismatched = [...trEntries].filter(([key, text]) => argumentsOf(text).join() !== argumentsOf(enEntries.get(key) ?? "").join());
    expect(mismatched.map(([key]) => key)).toEqual([]);
  });

  it("have balanced braces and no empty strings", () => {
    for (const [key, text] of [...trEntries, ...enEntries]) {
      expect(text.trim(), key).not.toBe("");
      expect(text.split("{").length, key).toBe(text.split("}").length);
    }
  });
});
