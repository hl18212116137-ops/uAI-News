import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isPipelineAdmin } from "@/lib/pipeline-admin";
import { getFetchPipelinePublicConfigPayload } from "@/lib/fetch-pipeline-public-config";
import { getUserSubscribedHandles } from "@/lib/subscriptions";
import { getCachedUserSubscribedSourcesMeta } from "@/lib/home-data-cache";
import PipelineAdminPanel from "@/components/PipelineAdminPanel";

export const dynamic = "force-dynamic";

export default async function PipelineAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirectTo=/admin/pipeline");
  if (!isPipelineAdmin(user)) notFound();
  const handles = await getUserSubscribedHandles(user.id);
  const [config, metadata] = await Promise.all([
    getFetchPipelinePublicConfigPayload(user),
    getCachedUserSubscribedSourcesMeta(user.id, handles),
  ]);
  return <main className="min-h-screen bg-[#f5f5f5] px-4 py-8">
    <div className="mx-auto max-w-200 space-y-6">
      <Link href="/" className="text-sm text-[#6a7282] hover:text-primary-600">返回资讯</Link>
      <h1 className="text-2xl font-semibold text-[#101828]">采集管理</h1>
      <PipelineAdminPanel initialConfig={config} sources={metadata.sources} user={user} />
    </div>
  </main>;
}
