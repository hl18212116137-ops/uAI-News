/**
 * 首页：middleware 已 refresh session，此处用 getSession 读 cookie，避免与 getUser 重复打 Auth API。
 * 顶栏在 HomePageShell；重查询在 HomeMainContentBlock（Suspense），缩短首字节到顶栏可用的时间。
 */
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import HomePageShell from "@/components/HomePageShell";
import HomeBodySkeleton from "@/components/HomeBodySkeleton";
import HomeMainContentBlock from "./HomeMainContentBlock";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createHomePerf } from "@/lib/home-perf";
import {
  getUserSubscribedHandles,
  getDefaultSubscribedHandles,
  ensureDefaultSubscriptions,
} from "@/lib/subscriptions";

export default async function Home() {
  const perf = createHomePerf("shell");

  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  perf.segment("session");

  const guestHandles = user ? [] : await getDefaultSubscribedHandles(3);
  let subscribedHandles = user ? await getUserSubscribedHandles(user.id) : guestHandles;

  if (user && subscribedHandles.length === 0) {
    await ensureDefaultSubscriptions(user.id, 3);
    subscribedHandles = await getUserSubscribedHandles(user.id);
  }
  perf.segment("handles");
  perf.logTotal();

  const isPersonalFeed = subscribedHandles.length > 0;
  const isGuestPersonalFeed = !user && isPersonalFeed;

  return (
    <HomePageShell user={user}>
      <Suspense fallback={<HomeBodySkeleton />}>
        <HomeMainContentBlock
          user={user}
          subscribedHandles={subscribedHandles}
          isPersonalFeed={isPersonalFeed}
          isGuestPersonalFeed={isGuestPersonalFeed}
        />
      </Suspense>
    </HomePageShell>
  );
}
