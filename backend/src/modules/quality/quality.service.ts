import type { PrismaClient } from "@prisma/client";
import { qualityScore } from "./engine.js";

export async function qualityHistory(db: PrismaClient) {
  const runs = await db.pipelineRun.findMany({
    where: { status: { in: ["SUCCEEDED", "PARTIAL"] } },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    take: 12,
    include: { qualityResults: true },
  });
  const history = runs.map((run) => {
    const checked = run.qualityResults.reduce((n, r) => n + r.checked, 0),
      failed = run.qualityResults.reduce((n, r) => n + r.failed, 0);
    return {
      id: run.id,
      startedAt: run.startedAt,
      status: run.status,
      checked,
      failed,
      score: qualityScore(checked, failed),
      rules: run.qualityResults.map((r) => ({
        ...r,
        score: qualityScore(r.checked, r.failed),
      })),
    };
  });
  return history.map((run, index) => ({
    ...run,
    change:
      run.score !== null &&
      history[index + 1]?.score !== null &&
      history[index + 1]?.score !== undefined
        ? Math.round((run.score - history[index + 1]!.score!) * 100) / 100
        : null,
  }));
}
