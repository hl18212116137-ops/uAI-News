export const RAW_POST_PROCESSABLE_STATUSES = ["new", "queued"] as const;

export type RawPostProcessableStatus = (typeof RAW_POST_PROCESSABLE_STATUSES)[number];

export const RAW_POST_PROCESSABLE_STATUS_VALUES = [...RAW_POST_PROCESSABLE_STATUSES];

export function isRawPostProcessableStatus(
  status: unknown
): status is RawPostProcessableStatus {
  return RAW_POST_PROCESSABLE_STATUSES.includes(status as RawPostProcessableStatus);
}
