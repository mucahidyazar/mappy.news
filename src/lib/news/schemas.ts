import { z } from "zod";

import { COMMENT_STATUSES, LOCATION_PRECISIONS, NEWS_RELATIONS } from "@/lib/domain/constants";
import { isInTurkey } from "@/lib/domain/location";

/**
 * Validation shared by forms and server actions. Error messages are translation keys under `validation.*`
 * so the client can show them in the visitor's language.
 */

const optionalUrl = z
  .union([z.literal(""), z.url({ error: "url", protocol: /^https?$/ }).max(600, { error: "urlTooLong" })])
  .optional()
  .transform((value) => value || undefined);

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);

export const locationInputSchema = z
  .object({
    latitude: z.number({ error: "locationRequired" }),
    longitude: z.number({ error: "locationRequired" }),
    label: z.string().trim().min(2, { error: "locationLabel" }).max(160, { error: "tooLong" }),
    precision: z.enum(LOCATION_PRECISIONS),
    province: nullableText(80),
    district: nullableText(80),
    neighborhood: nullableText(120),
    street: nullableText(160),
  })
  .refine((value) => isInTurkey(value.latitude, value.longitude), { error: "outsideTurkey", path: ["latitude"] });

export type LocationInput = z.infer<typeof locationInputSchema>;

const occurredAt = z
  .string({ error: "dateRequired" })
  .refine((value) => !Number.isNaN(Date.parse(value)), { error: "dateInvalid" })
  .refine((value) => Date.parse(value) <= Date.now() + 60 * 60 * 1000, { error: "dateFuture" })
  .refine((value) => Date.parse(value) >= Date.now() - 90 * 24 * 3600 * 1000, { error: "dateTooOld" });

/** Editors may correct the date of an older story. */
const editedOccurredAt = z
  .string({ error: "dateRequired" })
  .refine((value) => !Number.isNaN(Date.parse(value)), { error: "dateInvalid" })
  .refine((value) => Date.parse(value) <= Date.now() + 60 * 60 * 1000, { error: "dateFuture" });

export const reportInputSchema = z.object({
  title: z.string().trim().min(10, { error: "titleTooShort" }).max(140, { error: "titleTooLong" }),
  description: z.string().trim().min(30, { error: "descriptionTooShort" }).max(4000, { error: "tooLong" }),
  categoryKey: z.string({ error: "categoryRequired" }).regex(/^[a-z0-9_]{2,40}$/, { error: "categoryRequired" }),
  occurredAt,
  location: locationInputSchema,
  sourceUrl: optionalUrl,
  imageUrl: optionalUrl,
  confirm: z.literal(true, { error: "confirmRequired" }),
});

export type ReportInput = z.input<typeof reportInputSchema>;

export const commentInputSchema = z.object({
  newsId: z.uuid(),
  body: z.string().trim().min(2, { error: "commentTooShort" }).max(1500, { error: "tooLong" }),
});

export const verificationInputSchema = z.object({
  newsId: z.uuid(),
  address: z.string().trim().min(5, { error: "addressTooShort" }).max(240, { error: "tooLong" }),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  note: z.string().trim().max(1000, { error: "tooLong" }).optional(),
  evidenceUrl: optionalUrl,
});

/** What an editor may change on a story in the admin panel. */
export const newsEditSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(5, { error: "titleTooShort" }).max(160, { error: "titleTooLong" }),
  summary: z.string().trim().max(600, { error: "tooLong" }).optional().transform((value) => value || null),
  content: z.string().trim().max(10_000, { error: "tooLong" }).optional().transform((value) => value || null),
  categoryKey: z.string().regex(/^[a-z0-9_]{2,40}$/, { error: "categoryRequired" }),
  occurredAt: editedOccurredAt,
  location: locationInputSchema,
  sourceUrl: optionalUrl,
  imageUrl: optionalUrl,
  isSensitive: z.boolean(),
  isFeatured: z.boolean(),
});

export type NewsEditInput = z.input<typeof newsEditSchema>;

export const parentLinkSchema = z.object({
  id: z.uuid(),
  parentId: z.uuid().nullable(),
  relation: z.enum(NEWS_RELATIONS).nullable(),
});

export const commentModerationSchema = z.object({
  id: z.uuid(),
  status: z.enum(COMMENT_STATUSES),
  reason: z.string().trim().max(300).optional(),
});
