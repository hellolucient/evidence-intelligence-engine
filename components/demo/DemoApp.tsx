"use client";

import { useState } from "react";
import { useAnalysisState } from "@/lib/use-analysis-state";

export function DemoApp() {
  const { query, setQuery, result, setResult } = useAnalysisState();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardedResponse = result?.guarded_response ?? null;
  const evidenceSummary = result
    ? `Evidence Coherence Score: ${result.coherence_score}/100. ${result.claims?.length ?? 0} claims analyzed.`
    : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), includePubmed: false }),
      });
      
      const contentType = res.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Server returned ${res.status}: ${text.slice(0, 200)}`);
      }
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? `Request failed with status ${res.status}`);
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "2rem", color: "#1f2937", position: "relative", zIndex: 1 }}>
      {/* Badge */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.5rem" }}>
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 700,
            color: "#065f46",
            background: "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)",
            padding: "0.5rem 1rem",
            borderRadius: "20px",
            border: "1px solid #86efac",
            boxShadow: "0 2px 4px rgba(16, 185, 129, 0.2)",
            textTransform: "uppercase",
            letterSpacing: "0.05em"
          }}
        >
          ✓ Evidence Intelligence Active
        </span>
      </div>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <h1 style={{
          fontSize: "3rem",
          fontWeight: 800,
          marginBottom: "0.5rem",
          color: "#ffffff",
          textShadow: "0 2px 20px rgba(255,255,255,0.1)"
        }}>
          Longevity AI
        </h1>
        <p style={{ color: "rgba(255,255,255,0.85)", fontSize: "1.125rem", margin: 0 }}>
          Ask a longevity or biohacking question. You&apos;ll get an evidence-calibrated answer only.
        </p>
      </div>

      {/* Main Card */}
      <div style={{
        background: "white",
        borderRadius: "24px",
        padding: "2.5rem",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)"
      }}>
        <form onSubmit={handleSubmit}>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Should I do a 5-day water fast to extend lifespan?"
            rows={4}
            style={{
              width: "100%",
              padding: "1.25rem",
              borderRadius: "16px",
              border: "2px solid #e5e7eb",
              fontSize: "1rem",
              resize: "vertical",
              boxSizing: "border-box",
              transition: "all 0.2s",
              fontFamily: "inherit",
              background: "#fafafa"
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#667eea";
              e.target.style.boxShadow = "0 0 0 4px rgba(102, 126, 234, 0.1)";
              e.target.style.background = "white";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "#e5e7eb";
              e.target.style.boxShadow = "none";
              e.target.style.background = "#fafafa";
            }}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            style={{
              marginTop: "1rem",
              padding: "1rem 2.5rem",
              background: loading ? "#9ca3af" : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
              color: "white",
              border: "none",
              borderRadius: "16px",
              fontWeight: 700,
              fontSize: "1rem",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.2s",
              boxShadow: loading ? "none" : "0 4px 15px rgba(16, 185, 129, 0.4)",
              width: "100%"
            }}
            onMouseEnter={(e) => {
              if (!loading && query.trim()) {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 6px 20px rgba(16, 185, 129, 0.5)";
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 15px rgba(16, 185, 129, 0.4)";
              }
            }}
          >
            {loading ? "Analyzing…" : "Ask"}
          </button>
        </form>

        {error && (
          <div style={{
            marginTop: "1.5rem",
            padding: "1rem",
            background: "#fee2e2",
            border: "1px solid #fecaca",
            borderRadius: "12px",
            color: "#dc2626",
            fontSize: "0.9rem"
          }}>
            {error}
          </div>
        )}

        {guardedResponse && (
          <div style={{
            marginTop: "2rem",
            padding: "2rem",
            background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
            borderRadius: "20px",
            border: "2px solid #86efac",
            boxShadow: "0 4px 6px rgba(16, 185, 129, 0.1)"
          }}>
            <div style={{
              whiteSpace: "pre-wrap",
              lineHeight: 1.8,
              fontSize: "1rem",
              color: "#374151"
            }}>
              {guardedResponse}
            </div>
            {evidenceSummary && (
              <div style={{
                marginTop: "1.5rem",
                paddingTop: "1.5rem",
                borderTop: "2px solid #86efac"
              }}>
                <p style={{
                  margin: 0,
                  fontSize: "0.875rem",
                  color: "#065f46",
                  fontWeight: 600
                }}>
                  {evidenceSummary}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
