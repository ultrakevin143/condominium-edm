import { notFound } from "next/navigation";
import { Workspace } from "../../src/app-shell/workspace";
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (
    ![
      "pipeline",
      "tenants",
      "quality",
      "issues",
      "governance",
      "account",
    ].includes(section)
  )
    notFound();
  return <Workspace section={section} />;
}
