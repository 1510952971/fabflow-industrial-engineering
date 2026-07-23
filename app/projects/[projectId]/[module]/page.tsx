import Home from "@/app/page";
import { moduleFromSlug } from "@/lib/project-context";

export default async function ProjectModulePage({
  params,
}: {
  params: Promise<{ projectId: string; module: string }>;
}) {
  const route = await params;
  return <Home initialProjectId={decodeURIComponent(route.projectId)} initialModule={moduleFromSlug(route.module)} />;
}
