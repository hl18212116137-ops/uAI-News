import { z } from "zod";

const keyword = z.string().trim().min(1).max(200);
export const readingPreferenceSchema = z.discriminatedUnion("ruleType", [
  z.object({ module: z.literal("recommendation"), ruleType: z.literal("hide_if_contains"), payload: z.object({ substring: keyword }) }),
  z.object({ module: z.literal("recommendation"), ruleType: z.literal("prefer_keyword"), payload: z.object({ keyword }) }),
  z.object({ module: z.literal("recommendation"), ruleType: z.literal("recommendation_visible_days"), payload: z.object({ days: z.number().int().min(1).max(365) }) }),
]);

export type ReadingPreference = z.infer<typeof readingPreferenceSchema> & { id: string; enabled: boolean };
