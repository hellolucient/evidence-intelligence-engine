import { NextResponse } from "next/server";
import { runAnalysisWithMeta } from "@/lib/analysis/run-analysis";
import { fetchPubMedSummary } from "@/lib/pubmed";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body." },
        { status: 400 }
      );
    }

    const query = typeof body?.query === "string" ? body.query.trim() : null;
    if (!query) {
      return NextResponse.json(
        { error: "Missing or invalid 'query' in request body." },
        { status: 400 }
      );
    }

    // Default to true so PubMed check always runs unless explicitly disabled
    const includePubmed = body?.includePubmed !== false;
    
    try {
      const { result, meta } = await runAnalysisWithMeta(
        { query, includePubmed },
        { fetchPubmed: includePubmed ? fetchPubMedSummary : undefined }
      );
      const headers = new Headers();
      if (meta.persisted_analysis_id) {
        headers.set("x-eie-analysis-id", meta.persisted_analysis_id);
      }
      return NextResponse.json(result, { headers });
    } catch (analyzeErr) {
      const errorMessage = analyzeErr instanceof Error ? analyzeErr.message : String(analyzeErr);
      console.error("Analysis error:", errorMessage);
      return NextResponse.json(
        { error: `Analysis failed: ${errorMessage}` },
        { status: 500 }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error occurred.";
    console.error("API route error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
