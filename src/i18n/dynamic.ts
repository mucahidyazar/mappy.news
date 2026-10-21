import type { TranslationValues } from "next-intl";

type LooseTranslator = {
  (key: string, values?: TranslationValues): string;
  has(key: string): boolean;
};

/**
 * Translates a key built from runtime data (DB codes, worker events, zod messages), which the typed
 * translator can't check at compile time. Returns `null` when the message doesn't exist.
 */
export function translateDynamic(t: object, key: string, values?: TranslationValues): string | null {
  const translator = t as LooseTranslator;
  return translator.has(key) ? translator(key, values) : null;
}
