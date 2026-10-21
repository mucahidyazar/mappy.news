import { describe, expect, it } from "vitest";

import { expandTweetText, mapTweets, normalizeHandle, pollXAccount, XApiError } from "./x";

describe("normalizeHandle", () => {
  it("accepts handles, @handles and profile links", () => {
    expect(normalizeHandle("@AFADBaskanlik")).toBe("afadbaskanlik");
    expect(normalizeHandle("https://x.com/ibbBeyazmasa?lang=tr")).toBe("ibbbeyazmasa");
    expect(normalizeHandle("https://twitter.com/jandarma/status/1")).toBe("jandarma");
    expect(normalizeHandle("not a handle!")).toBeNull();
    expect(normalizeHandle("waytoolonghandle_123")).toBeNull();
  });
});

describe("expandTweetText", () => {
  it("expands links and drops media links", () => {
    const tweet = {
      id: "1",
      text: "Kadıköy'de yangın &amp; tahliye https://t.co/abc https://t.co/media",
      entities: {
        urls: [
          { start: 33, end: 56, url: "https://t.co/abc", expanded_url: "https://ornek.example/haber/1" },
          { start: 57, end: 80, url: "https://t.co/media", media_key: "3_1" },
        ],
      },
    };
    expect(expandTweetText(tweet)).toBe("Kadıköy'de yangın & tahliye https://ornek.example/haber/1");
  });
});

describe("mapTweets", () => {
  it("links each post and keeps photos and video previews", () => {
    const [entry] = mapTweets(
      "afadbaskanlik",
      [{ id: "99", text: "Deprem bilgilendirmesi", created_at: "2026-10-21T08:00:00.000Z", attachments: { media_keys: ["3_1", "7_2", "missing"] } }],
      [
        { media_key: "3_1", type: "photo", url: "https://pbs.twimg.com/media/a.jpg" },
        { media_key: "7_2", type: "video", preview_image_url: "https://pbs.twimg.com/b.jpg" },
      ],
    );
    expect(entry).toMatchObject({
      externalId: "99",
      url: "https://x.com/afadbaskanlik/status/99",
      author: "@afadbaskanlik",
      media: [
        { type: "x_post", url: "https://x.com/afadbaskanlik/status/99" },
        { type: "image", url: "https://pbs.twimg.com/media/a.jpg" },
        { type: "video", url: "https://x.com/afadbaskanlik/status/99", previewUrl: "https://pbs.twimg.com/b.jpg" },
      ],
    });
    expect(entry!.publishedAt?.toISOString()).toBe("2026-10-21T08:00:00.000Z");
  });

  it("skips posts that are only links to media", () => {
    expect(mapTweets("a", [{ id: "1", text: "https://t.co/m", entities: { urls: [{ start: 0, end: 14, url: "https://t.co/m", media_key: "3_1" }] } }], [])).toEqual([]);
  });
});

describe("pollXAccount", () => {
  it("reads posts newer than the cursor without replies or reposts", async () => {
    const requested: string[] = [];
    const fetchImpl = (async (url: string) => {
      requested.push(url);
      return Response.json({ data: [{ id: "120", text: "Trafik kazası: 2 yaralı" }], meta: { newest_id: "120", result_count: 1 } });
    }) as typeof fetch;
    const result = await pollXAccount({ handle: "polis", userId: "42", sinceId: "100", maxResults: 2, token: "test", fetchImpl });
    const url = new URL(requested[0]!);
    expect(url.pathname).toBe("/2/users/42/tweets");
    expect(url.searchParams.get("since_id")).toBe("100");
    expect(url.searchParams.get("exclude")).toBe("replies,retweets");
    expect(url.searchParams.get("max_results")).toBe("5");
    expect(result).toMatchObject({ userId: "42", sinceId: "120", reads: 1 });
  });

  it("keeps the cursor when nothing is new and reports rate limits with the reset time", async () => {
    const empty = (async () => Response.json({ meta: { result_count: 0 } })) as typeof fetch;
    expect(await pollXAccount({ handle: "polis", userId: "42", sinceId: "100", maxResults: 10, token: "t", fetchImpl: empty })).toMatchObject({ sinceId: "100", reads: 0 });

    const limited = (async () => new Response(null, { status: 429, headers: { "x-rate-limit-reset": "1792569600" } })) as typeof fetch;
    const error = await pollXAccount({ handle: "polis", userId: "42", maxResults: 10, token: "t", fetchImpl: limited }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(XApiError);
    expect((error as XApiError).resetAt?.getTime()).toBe(1_792_569_600_000);
  });
});
