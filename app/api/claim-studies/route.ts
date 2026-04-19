import { NextResponse } from "next/server";
import { searchStudiesForClaim } from "@/lib/study-search";

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

    const claimText = typeof body?.claimText === "string" ? body.claimText.trim() : null;
    const originalQuery = typeof body?.originalQuery === "string" ? body.originalQuery.trim() : null;
    
    if (!claimText || !originalQuery) {
      return NextResponse.json(
        { error: "Missing 'claimText' or 'originalQuery' in request body." },
        { status: 400 }
      );
    }

    try {
      const result = await searchStudiesForClaim(claimText, originalQuery);
      return NextResponse.json(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Study search error:", errorMessage);
      return NextResponse.json(
        { error: `Study search failed: ${errorMessage}` },
        { status: 500 }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error occurred.";
    console.error("API route error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
