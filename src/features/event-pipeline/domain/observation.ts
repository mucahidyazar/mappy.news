import { z } from "zod";

const latitudeSchema = z.number().finite().min(-90).max(90);
const longitudeSchema = z.number().finite().min(-180).max(180);

const mediaSchema = z
  .object({
    type: z.enum(["image", "video", "audio"]),
    url: z.string().url(),
    providerMediaId: z.string().min(1).optional(),
    altText: z.string().optional(),
  })
  .strict();

const geoHintSchema = z
  .object({
    kind: z.literal("post_coordinates"),
    relation: z.enum(["post_origin", "event_site"]),
    latitude: latitudeSchema,
    longitude: longitudeSchema,
  })
  .strict();

export const observationSchema = z
  .object({
    id: z.string().uuid(),
    provider: z.string().min(1),
    providerItemId: z.string().min(1),
    canonicalUrl: z.string().url(),
    authorExternalId: z.string().min(1),
    publishedAt: z.string().datetime({ offset: true }),
    capturedAt: z.string().datetime({ offset: true }),
    language: z.string().min(2).max(35),
    text: z.string(),
    media: z.array(mediaSchema),
    geoHints: z.array(geoHintSchema),
  })
  .strict()
  .superRefine((observation, context) => {
    if (observation.text.trim().length === 0 && observation.media.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "An observation must contain text or media.",
        path: ["text"],
      });
    }
  });

type ParsedObservation = z.infer<typeof observationSchema>;

export type Observation = Readonly<
  Omit<ParsedObservation, "media" | "geoHints"> & {
    media: ReadonlyArray<Readonly<ParsedObservation["media"][number]>>;
    geoHints: ReadonlyArray<Readonly<ParsedObservation["geoHints"][number]>>;
  }
>;

export function parseObservation(input: unknown): Observation {
  const parsed = observationSchema.parse(input);

  return Object.freeze({
    ...parsed,
    media: Object.freeze(
      parsed.media.map((mediaItem) => Object.freeze({ ...mediaItem })),
    ),
    geoHints: Object.freeze(
      parsed.geoHints.map((geoHint) => Object.freeze({ ...geoHint })),
    ),
  });
}
