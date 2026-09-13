import { PrintIssueClient } from "@/components/print/print-issue-client";

export default async function PrintIssuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PrintIssueClient issueId={id} />;
}
