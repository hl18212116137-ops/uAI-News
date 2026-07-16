export const RAW_POST_PROCESSABLE_STATUSES = ["new", "queued"] as const;

export type RawPostProcessableStatus = (typeof RAW_POST_PROCESSABLE_STATUSES)[number];

export const RAW_POST_PROCESSABLE_STATUS_VALUES = [...RAW_POST_PROCESSABLE_STATUSES];

export function isRawPostProcessableStatus(
  status: unknown
): status is RawPostProcessableStatus {
  return RAW_POST_PROCESSABLE_STATUSES.includes(status as RawPostProcessableStatus);
}

/** null means consume the historical queue; an array means only this refresh batch. */
export function normalizeRequestedRawIds(rawIds?: string[]): string[] | null {
  if (rawIds === undefined) return null;
  return [...new Set(rawIds.map((id) => id.trim()).filter(Boolean))];
}

export function getProcessingBatchFailure(input: {
  attempted: number;
  errors: number;
  samples: string[];
}): string | null {
  if (input.attempted === 0 || input.errors !== input.attempted) return null;
  const sample = input.samples.find((message) => message.trim())?.trim();
  return sample
    ? `AI processing failed for every item: ${sample}`
    : 'AI processing failed for every item';
}
