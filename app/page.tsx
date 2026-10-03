export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { unstable_cache } from "next/cache";
import HomePageShell from "@/components/HomePageShell";
import HomeBodySkeleton from "@/components/HomeBodySkeleton";
import HomeMainContentBlock from "./HomeMainContentBlock";
import { getCurrentUser } from "@/lib/auth";
import { createHomePerf } from "@/lib/home-perf";
import {
  getUserSubscribedHandles,
  getDefaultSubscribedHandles,
} from "@/lib/subscriptions";

const getCachedDefaultSubscribedHandles = unstable_cache(
  () => getDefaultSubscribedHandles(3),
  ["home-default-subscribed-handles"],
  { revalidate: 60 }
);

export default async function Home() {
  const perf = createHomePerf("shell");

  const user = await getCurrentUser();
  perf.segment("session");

  const guestHandles = user ? [] : await getCachedDefaultSubscribedHandles();
  const subscribedHandles = user ? await getUserSubscribedHandles(user.id) : guestHandles;

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
