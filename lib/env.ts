/** Normalize values copied through shells or deployment dashboards. */
export function cleanEnvValue(value: string | undefined): string {
  return (value ?? '').replace(/^\uFEFF+/, '').trim()
}
