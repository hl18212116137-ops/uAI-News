import MainContent from "@/components/MainContent";
import { loadHomeContent, type HomeMainContentBlockProps } from "@/lib/services/home-service";

/** Suspense boundary: the shell can stream while feed data is assembled. */
export default async function HomeMainContentBlock(props: HomeMainContentBlockProps) {
  return <MainContent {...await loadHomeContent(props)} />;
}
