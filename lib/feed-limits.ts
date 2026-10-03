/** Bound database rows and semantic ranking work per feed snapshot. */
export function getFeedCandidateLimit(): number {
  const value = Number(process.env.FEED_CANDIDATE_LIMIT || 1000);
  return Number.isFinite(value) ? Math.min(5000, Math.max(100, Math.trunc(value))) : 1000;
}
