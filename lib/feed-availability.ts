import "server-only";
import { unstable_cache } from "next/cache";
import { pool } from "@/lib/db/drizzle";

/** Only used for empty results, to distinguish an empty feed from unavailable storage. */
export const isFeedStorageAvailable = unstable_cache(async () => {
  try {
    await pool.query("SELECT id FROM news_items LIMIT 1");
    return true;
  } catch {
    return false;
  }
}, ["feed-storage-availability"], { revalidate: 10 });
