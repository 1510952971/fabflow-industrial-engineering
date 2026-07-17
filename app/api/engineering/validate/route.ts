import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bomItems, interfaces, punchItems, selectionRuns, systems, tags, testPacks } from "@/db/schema";
import { errorResponse } from "@/lib/api";
import { assertProjectAccess, authorize, PUBLIC_DEMO_PROJECT_ID } from "@/lib/auth";
import { validateEngineeringProject } from "@/lib/engineering-validation";

export async function GET(request: Request) {
  try {
    const principal = await authorize(request, "data:read");
    const projectId = new URL(request.url).searchParams.get("projectId") ?? PUBLIC_DEMO_PROJECT_ID;
    assertProjectAccess(principal, projectId);
    const db = getDb();
    const [projectSystems, projectTags, projectInterfaces, projectBom, projectTests, projectPunches, projectSelections] = await Promise.all([
      db.select().from(systems).where(eq(systems.projectId, projectId)),
      db.select().from(tags).where(eq(tags.projectId, projectId)),
      db.select().from(interfaces).where(eq(interfaces.projectId, projectId)),
      db.select().from(bomItems).where(eq(bomItems.projectId, projectId)),
      db.select().from(testPacks).where(eq(testPacks.projectId, projectId)),
      db.select().from(punchItems).where(eq(punchItems.projectId, projectId)),
      db.select().from(selectionRuns).where(eq(selectionRuns.projectId, projectId)),
    ]);
    const validation = validateEngineeringProject({ systems: projectSystems, tags: projectTags, interfaces: projectInterfaces, bomItems: projectBom, testPacks: projectTests, punchItems: projectPunches, selectionRuns: projectSelections });
    return Response.json({ projectId, principal, ...validation, records: { interfaces: projectInterfaces, tags: projectTags, testPacks: projectTests, punchItems: projectPunches } });
  } catch (error) {
    return errorResponse(error);
  }
}
