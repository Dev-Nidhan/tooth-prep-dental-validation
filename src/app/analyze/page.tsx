import { Suspense } from "react";
import { AnalyzeApp } from "@/components/analyze-app";

export const metadata = {
  title: "Check a preparation",
};

export default function AnalyzePage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-16 text-sm text-muted-foreground">Opening the check…</div>}>
      <AnalyzeApp />
    </Suspense>
  );
}
