"use client";

import { useState, useMemo, useEffect } from "react";
import { useAnalysisState } from "@/lib/use-analysis-state";
import type { EvidenceFlag, ExtractedClaim, Study } from "@/engine/types";

// Flag colors for visual matching
const FLAG_COLORS = [
  { bg: "#fef3c7", border: "#fde68a", text: "#92400e", dotColor: "#dc2626" }, // Red - vibrant red
  { bg: "#dbeafe", border: "#93c5fd", text: "#1e40af", dotColor: "#f59e0b" }, // Orange - bright orange
  { bg: "#fce7f3", border: "#f9a8d4", text: "#9f1239", dotColor: "#8b5cf6" }, // Purple - vibrant purple
  { bg: "#e0e7ff", border: "#a5b4fc", text: "#3730a3", dotColor: "#2563eb" }, // Blue - bright blue
  { bg: "#fef2f2", border: "#fecaca", text: "#991b1b", dotColor: "#ec4899" }, // Pink - vibrant pink
  { bg: "#ecfdf5", border: "#86efac", text: "#065f46", dotColor: "#10b981" }, // Green - vibrant green
];

function truncateMiddle(value: string, head: number, tail: number): string {
  const s = value ?? "";
  if (s.length <= head + tail + 3) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

/**
 * Insert flag markers into raw output text where flagged claims appear
 */
function insertFlagMarkers(
  rawText: string,
  claims: ExtractedClaim[],
  flags: EvidenceFlag[]
): { text: string; flagPositions: Array<{ flagIndex: number; position: number }> } {
  if (!flags.length || !claims.length) {
    return { text: rawText, flagPositions: [] };
  }

  const flagPositions: Array<{ flagIndex: number; position: number }> = [];
  let modifiedText = rawText;
  let offset = 0;

  // Sort flags by claim index to process in order
  const sortedFlags = [...flags].sort((a, b) => a.claim_index - b.claim_index);

  for (const flag of sortedFlags) {
    const claim = claims[flag.claim_index];
    if (!claim) continue;

    // Find where the claim text appears in raw output (fuzzy match)
    const claimWords = claim.claim_text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    if (claimWords.length === 0) continue;

    // Try to find a unique phrase from the claim in the raw text
    let foundIndex = -1;
    for (let i = 0; i < claimWords.length - 1; i++) {
      const phrase = `${claimWords[i]} ${claimWords[i + 1]}`;
      const searchIndex = modifiedText.toLowerCase().indexOf(phrase, offset);
      if (searchIndex !== -1) {
        foundIndex = searchIndex;
        break;
      }
    }

    // Fallback: search for first significant word
    if (foundIndex === -1 && claimWords.length > 0) {
      foundIndex = modifiedText.toLowerCase().indexOf(claimWords[0], offset);
    }

    if (foundIndex !== -1) {
      const flagIndex = flags.indexOf(flag);
      const color = FLAG_COLORS[flagIndex % FLAG_COLORS.length];
      // Use consistent-sized dot with high-contrast color (no border)
      const marker = ` <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${color.dotColor}; margin-right: 6px; vertical-align: middle;"></span>`;
      
      modifiedText = modifiedText.slice(0, foundIndex) + marker + modifiedText.slice(foundIndex);
      flagPositions.push({ flagIndex, position: foundIndex });
      offset = foundIndex + marker.length;
    }
  }

  return { text: modifiedText, flagPositions };
}

function ClaimCardWrapper({
  claim,
  color,
  studyData,
}: {
  claim: ExtractedClaim;
  color: { bg: string; border: string; text: string; dotColor: string } | null;
  studyData?: { rct_count: number; meta_analysis_count: number; studies: Study[] };
}) {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <ClaimCard
      claim={claim}
      color={color}
      studyData={studyData}
      expanded={expanded}
      onToggleExpand={() => setExpanded(!expanded)}
    />
  );
}

function ClaimCard({
  claim,
  color,
  studyData,
  expanded,
  onToggleExpand,
}: {
  claim: ExtractedClaim;
  color: { bg: string; border: string; text: string; dotColor: string } | null;
  studyData?: { rct_count: number; meta_analysis_count: number; studies: Study[] };
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  return (
    <div style={{
      marginBottom: "1rem",
      padding: "1rem",
      background: color ? color.bg : "linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)",
      borderRadius: "12px",
      border: color ? `2px solid ${color.border}` : "1px solid #e5e7eb",
      position: "relative"
    }}>
      {color && (
        <span style={{
          position: "absolute",
          top: "0.5rem",
          right: "0.5rem",
          display: "inline-block",
          width: "10px",
          height: "10px",
          borderRadius: "50%",
          background: color.dotColor
        }}></span>
      )}
      <div style={{
        fontSize: "0.75rem",
        fontWeight: 700,
        color: "#6b7280",
        marginBottom: "0.5rem",
        textTransform: "uppercase",
        letterSpacing: "0.05em"
      }}>
        {claim.claim_type} · {claim.detected_certainty_level}
      </div>
      <div style={{ fontSize: "0.875rem", lineHeight: 1.6, color: "#374151", marginBottom: studyData ? "0.75rem" : 0 }}>
        {claim.claim_text}
      </div>
      {studyData && (studyData.rct_count > 0 || studyData.meta_analysis_count > 0 || studyData.studies.length > 0) && (
        <div style={{
          marginTop: "0.75rem",
          paddingTop: "0.75rem",
          borderTop: "1px solid rgba(0,0,0,0.1)"
        }}>
          <div style={{
            fontSize: "0.75rem",
            color: "#6b7280",
            display: "flex",
            gap: "1rem",
            alignItems: "center",
            marginBottom: studyData.studies.length > 0 ? "0.5rem" : 0,
            flexWrap: "wrap"
          }}>
            <span style={{ fontWeight: 600, color: "#059669" }}>
              Evidence:
            </span>
            <span>
              {studyData.rct_count} RCT{studyData.rct_count !== 1 ? 's' : ''}
            </span>
            <span style={{ color: "#9ca3af" }}>·</span>
            <span>
              {studyData.meta_analysis_count} Meta-analys{studyData.meta_analysis_count !== 1 ? 'es' : 'is'}
            </span>
            {studyData.studies.length > 0 && (
              <>
                <span style={{ color: "#9ca3af" }}>·</span>
                <button
                  onClick={onToggleExpand}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#059669",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    textDecoration: "underline",
                    padding: 0
                  }}
                >
                  {expanded ? "Hide" : "Show"} {studyData.studies.length} {studyData.studies.length === 1 ? 'study' : 'studies'}
                </button>
              </>
            )}
          </div>
          {expanded && studyData.studies.length > 0 && (
            <div style={{
              marginTop: "0.75rem",
              padding: "0.75rem",
              background: "white",
              borderRadius: "8px",
              border: "1px solid #e5e7eb",
              maxHeight: "300px",
              overflowY: "auto"
            }}>
              {studyData.studies.map((study, idx) => (
                <div key={idx} style={{
                  marginBottom: idx < studyData.studies.length - 1 ? "0.75rem" : 0,
                  paddingBottom: idx < studyData.studies.length - 1 ? "0.75rem" : 0,
                  borderBottom: idx < studyData.studies.length - 1 ? "1px solid #f3f4f6" : "none"
                }}>
                  <a
                    href={study.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "#2563eb",
                      textDecoration: "none",
                      display: "block",
                      marginBottom: "0.25rem"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.textDecoration = "underline";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.textDecoration = "none";
                    }}
                  >
                    {study.title}
                  </a>
                  <div style={{
                    fontSize: "0.7rem",
                    color: "#6b7280",
                    marginTop: "0.25rem"
                  }}>
                    {study.authors.length > 0 && (
                      <span>{study.authors.join(', ')}{study.authors.length < 3 ? ' et al.' : ''}</span>
                    )}
                    {study.year && (
                      <>
                        {study.authors.length > 0 && ' · '}
                        <span>{study.year}</span>
                      </>
                    )}
                    {study.journal && (
                      <>
                        {' · '}
                        <span>{study.journal}</span>
                      </>
                    )}
                    {' · '}
                    <span style={{ textTransform: "capitalize" }}>{study.source.replace('_', ' ')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DashboardView() {
  const { query, setQuery, result, setResult } = useAnalysisState();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transparencyOn, setTransparencyOn] = useState(true);
  const [menuDescriptions, setMenuDescriptions] = useState<string[] | null>(null);
  const [menuLoading, setMenuLoading] = useState(false);
  const [productDescriptions, setProductDescriptions] = useState<string[] | null>(null);
  const [productLoading, setProductLoading] = useState(false);
  const [descriptionModalType, setDescriptionModalType] = useState<"menu" | "product" | null>(null);
  const [modalPosition, setModalPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Operator: Animoca email workflow (persisted analysis only)
  const [analysisIdInput, setAnalysisIdInput] = useState("");
  const [animocaBrief, setAnimocaBrief] = useState<{ subject: string; body_text: string; to: string } | null>(null);
  const [animocaLoading, setAnimocaLoading] = useState(false);
  const [animocaSendLoading, setAnimocaSendLoading] = useState(false);
  const [animocaStatus, setAnimocaStatus] = useState<string | null>(null);
  const [currentPersistedAnalysis, setCurrentPersistedAnalysis] = useState<{
    analysis_id: string;
    query_text: string;
    coherence_score: number | null;
    created_at: string | null;
  } | null>(null);
  const [analysisIdWasManuallyEdited, setAnalysisIdWasManuallyEdited] = useState(false);

  // Process raw output with flag markers
  const rawOutputWithFlags = useMemo(() => {
    if (!result?.raw_response || !result?.claims || !result?.evidence_flags) {
      return { text: result?.raw_response || "", flagPositions: [] };
    }
    return insertFlagMarkers(result.raw_response, result.claims, result.evidence_flags);
  }, [result]);

  async function runAnalysis(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), includePubmed: true }),
      });
      
      const persistedId = res.headers.get("x-eie-analysis-id");
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

      if (persistedId) {
        const next = {
          analysis_id: persistedId,
          query_text: query.trim(),
          coherence_score: typeof data?.coherence_score === "number" ? data.coherence_score : null,
          created_at: null,
        };
        setCurrentPersistedAnalysis(next);
        // Auto-fill operator panel unless the operator explicitly overrode the field.
        setAnalysisIdInput((prev) => {
          if (analysisIdWasManuallyEdited && prev.trim()) return prev;
          return persistedId;
        });
        setAnimocaStatus(`Persisted analysis captured: ${persistedId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function generateMenuDescriptions() {
    if (!query.trim() || !result?.guarded_response) return;
    setMenuLoading(true);
    setMenuDescriptions(null);
    setDescriptionModalType("menu");
    setModalPosition(null);
    try {
      const res = await fetch("/api/menu-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guardedOutput: result.guarded_response,
          originalQuery: query.trim(),
        }),
      });
      const contentType = res.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Server returned ${res.status}: ${text.slice(0, 200)}`);
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Request failed with status ${res.status}`);
      setMenuDescriptions(data.descriptions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate menu descriptions");
      setDescriptionModalType(null);
    } finally {
      setMenuLoading(false);
    }
  }

  async function generateProductDescriptions() {
    if (!query.trim() || !result?.guarded_response) return;
    setProductLoading(true);
    setProductDescriptions(null);
    setDescriptionModalType("product");
    setModalPosition(null);
    try {
      const res = await fetch("/api/product-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guardedOutput: result.guarded_response,
          originalQuery: query.trim(),
        }),
      });
      const contentType = res.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Server returned ${res.status}: ${text.slice(0, 200)}`);
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Request failed with status ${res.status}`);
      setProductDescriptions(data.descriptions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate product descriptions");
      setDescriptionModalType(null);
    } finally {
      setProductLoading(false);
    }
  }

  async function generateAnimocaBrief() {
    const analysis_id = (analysisIdInput.trim() || currentPersistedAnalysis?.analysis_id || "").trim();
    if (!analysis_id) return;
    setAnimocaLoading(true);
    setAnimocaStatus(null);
    setAnimocaBrief(null);
    try {
      const res = await fetch("/api/animoca/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis_id }),
      });
      const contentType = res.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Server returned ${res.status}: ${text.slice(0, 200)}`);
      }
      const data = await res.json();
      if (data?.status === "missing_persistence_config") {
        setAnimocaStatus("Persistence config missing on server; cannot load persisted analyses.");
        return;
      }
      if (!res.ok) {
        throw new Error(data?.error ?? `Request failed with status ${res.status}`);
      }
      if (data?.status !== "ok" || typeof data?.subject !== "string" || typeof data?.body_text !== "string") {
        throw new Error("Unexpected brief response.");
      }
      setAnimocaBrief({ subject: data.subject, body_text: data.body_text, to: data.to ?? "" });
      if (typeof data?.analysis_id === "string") {
        setCurrentPersistedAnalysis({
          analysis_id: data.analysis_id,
          query_text: typeof data?.query_text === "string" ? data.query_text : (currentPersistedAnalysis?.query_text ?? ""),
          coherence_score: typeof data?.coherence_score === "number" ? data.coherence_score : (currentPersistedAnalysis?.coherence_score ?? null),
          created_at: typeof data?.created_at === "string" ? data.created_at : (currentPersistedAnalysis?.created_at ?? null),
        });
      }
      setAnimocaStatus("Brief generated.");
    } catch (err) {
      setAnimocaStatus(err instanceof Error ? err.message : "Failed to generate brief");
    } finally {
      setAnimocaLoading(false);
    }
  }

  async function copyAnimocaBrief() {
    if (!animocaBrief) return;
    const text = `Subject: ${animocaBrief.subject}\nTo: ${animocaBrief.to}\n\n${animocaBrief.body_text}`;
    try {
      await navigator.clipboard.writeText(text);
      setAnimocaStatus("Copied to clipboard.");
    } catch {
      setAnimocaStatus("Copy failed (clipboard permission).");
    }
  }

  async function sendAnimocaEmail() {
    const analysis_id = (analysisIdInput.trim() || currentPersistedAnalysis?.analysis_id || "").trim();
    if (!analysis_id) return;
    setAnimocaSendLoading(true);
    setAnimocaStatus(null);
    try {
      const res = await fetch("/api/animoca/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis_id }),
      });
      const contentType = res.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Server returned ${res.status}: ${text.slice(0, 200)}`);
      }
      const data = await res.json();
      if (data?.status === "missing_persistence_config") {
        setAnimocaStatus("Persistence config missing on server; cannot send.");
        return;
      }
      if (data?.status === "missing_email_config") {
        setAnimocaStatus(`Email config missing on server: ${data?.reason ?? "unknown"}`);
        return;
      }
      if (data?.status === "failure") {
        setAnimocaStatus(`Send failed: ${data?.reason ?? "unknown"}`);
        return;
      }
      if (data?.status === "success") {
        setAnimocaStatus("Sent to Mind.");
        return;
      }
      if (!res.ok) {
        throw new Error(data?.error ?? `Request failed with status ${res.status}`);
      }
      setAnimocaStatus("Unexpected send response.");
    } catch (err) {
      setAnimocaStatus(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setAnimocaSendLoading(false);
    }
  }

  const handleModalMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return; // Don't drag if clicking button
    setIsDragging(true);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const currentX = modalPosition?.x ?? (rect.left + rect.width / 2);
    const currentY = modalPosition?.y ?? (rect.top + rect.height / 2);
    setDragOffset({
      x: e.clientX - currentX,
      y: e.clientY - currentY,
    });
    // Initialize position if not set
    if (!modalPosition) {
      setModalPosition({
        x: e.clientX - rect.width / 2,
        y: e.clientY - rect.height / 2,
      });
    }
  };

  // Add event listeners for dragging
  useEffect(() => {
    if (!isDragging) return;

    const handleModalMouseMove = (e: MouseEvent) => {
      setModalPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      });
    };

    const handleModalMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleModalMouseMove);
    window.addEventListener('mouseup', handleModalMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleModalMouseMove);
      window.removeEventListener('mouseup', handleModalMouseUp);
    };
  }, [isDragging, dragOffset]);

  return (
    <div style={{ 
      width: "100%", 
      maxWidth: "100%", 
      padding: "2rem", 
      color: "#1f2937", 
      position: "relative", 
      zIndex: 1,
      boxSizing: "border-box"
    }}>
      {/* Header */}
      <div style={{ marginBottom: "2rem", textAlign: "center" }}>
        <h1 style={{ 
          fontSize: "2.5rem", 
          fontWeight: 800, 
          marginBottom: "0.5rem",
          color: "#ffffff",
          textShadow: "0 2px 20px rgba(255,255,255,0.1)"
        }}>
          Evidence Intelligence Dashboard
        </h1>
        <p style={{ color: "rgba(255,255,255,0.8)", fontSize: "1rem", margin: 0 }}>
          Full transparency view: raw vs guarded output, claims, evidence flags, and coherence score
        </p>
      </div>

      {/* Main Card */}
      <div style={{
        background: "rgba(255, 255, 255, 0.95)",
        backdropFilter: "blur(20px)",
        borderRadius: "24px",
        padding: "2rem",
        boxShadow: "0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1)",
        maxWidth: "100%",
        width: "100%",
        margin: "0 auto",
        boxSizing: "border-box",
        overflow: "hidden"
      }}>
        <form onSubmit={runAnalysis}>
          <label style={{ display: "block", marginBottom: "0.75rem", fontWeight: 600, fontSize: "0.875rem", color: "#374151" }}>
            Your Question
          </label>
          <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Should I do a 5-day water fast to extend lifespan?"
              rows={6}
              style={{
                flex: "1 1 50%",
                minWidth: "300px",
                minHeight: "9rem",
                padding: "1rem",
                borderRadius: "12px",
                border: "2px solid #e5e7eb",
                fontSize: "1rem",
                boxSizing: "border-box",
                transition: "all 0.2s",
                fontFamily: "inherit",
                resize: "vertical"
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#667eea";
                e.target.style.boxShadow = "0 0 0 3px rgba(102, 126, 234, 0.1)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "#e5e7eb";
                e.target.style.boxShadow = "none";
              }}
              disabled={loading || menuLoading || productLoading}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", flexShrink: 0 }}>
              <button
                type="button"
                onClick={generateMenuDescriptions}
                disabled={menuLoading || productLoading || loading || !query.trim() || !result?.guarded_response}
                style={{
                  padding: "0.75rem 1.5rem",
                  background: menuLoading ? "#9ca3af" : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: "12px",
                  fontWeight: 600,
                  fontSize: "0.95rem",
                  cursor: menuLoading || !query.trim() ? "not-allowed" : "pointer",
                  transition: "all 0.2s",
                  boxShadow: menuLoading ? "none" : "0 4px 15px rgba(16, 185, 129, 0.4)",
                  whiteSpace: "nowrap"
                }}
                onMouseEnter={(e) => {
                  if (!menuLoading && query.trim()) {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 6px 20px rgba(16, 185, 129, 0.5)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!menuLoading) {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 4px 15px rgba(16, 185, 129, 0.4)";
                  }
                }}
              >
                {menuLoading ? "Generating…" : "Menu Description"}
              </button>
              <button
                type="button"
                onClick={generateProductDescriptions}
                disabled={menuLoading || productLoading || loading || !query.trim() || !result?.guarded_response}
                style={{
                  padding: "0.75rem 1.5rem",
                  background: productLoading ? "#9ca3af" : "linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: "12px",
                  fontWeight: 600,
                  fontSize: "0.95rem",
                  cursor: productLoading || !query.trim() ? "not-allowed" : "pointer",
                  transition: "all 0.2s",
                  boxShadow: productLoading ? "none" : "0 4px 15px rgba(14, 165, 233, 0.4)",
                  whiteSpace: "nowrap"
                }}
                onMouseEnter={(e) => {
                  if (!productLoading && query.trim()) {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 6px 20px rgba(14, 165, 233, 0.5)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!productLoading) {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 4px 15px rgba(14, 165, 233, 0.4)";
                  }
                }}
              >
                {productLoading ? "Generating…" : "Product Description"}
              </button>
              <button
                type="submit"
                disabled={loading || menuLoading || productLoading || !query.trim()}
                style={{
                  padding: "0.75rem 1.5rem",
                  background: loading ? "#9ca3af" : "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: "12px",
                  fontWeight: 600,
                  fontSize: "0.95rem",
                  cursor: loading || !query.trim() ? "not-allowed" : "pointer",
                  transition: "all 0.2s",
                  boxShadow: loading ? "none" : "0 4px 15px rgba(59, 130, 246, 0.4)",
                  whiteSpace: "nowrap"
                }}
                onMouseEnter={(e) => {
                  if (!loading && query.trim()) {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 6px 20px rgba(59, 130, 246, 0.5)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 4px 15px rgba(59, 130, 246, 0.4)";
                  }
                }}
              >
                {loading ? "Analyzing…" : "Analyze"}
              </button>
            </div>
          </div>
          
          <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap", marginTop: "1.5rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.9rem", color: "#374151" }}>
              <input
                type="checkbox"
                checked={transparencyOn}
                onChange={(e) => setTransparencyOn(e.target.checked)}
                style={{ width: "18px", height: "18px", cursor: "pointer" }}
              />
              Transparency ON
            </label>
          </div>
        </form>

        {/* Operator: Animoca email workflow (persisted analysis) */}
        <div style={{ marginTop: "1.25rem" }}>
          <div
            style={{
              padding: "1.25rem",
              borderRadius: "16px",
              border: "1px solid #e5e7eb",
              background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: "#111827" }}>
                Operator Tools — Animoca Mind
              </h3>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "#6b7280" }}>
                Requires a persisted <code>analysis_id</code>. Generate/Copy works without email config.
              </p>
            </div>

            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.75rem" }}>
              <input
                value={analysisIdInput}
                onChange={(e) => {
                  setAnalysisIdWasManuallyEdited(true);
                  setAnalysisIdInput(e.target.value);
                }}
                placeholder="analysis_id (uuid)…"
                style={{
                  flex: "1 1 340px",
                  minWidth: "260px",
                  padding: "0.75rem 0.9rem",
                  borderRadius: "12px",
                  border: "2px solid #e5e7eb",
                  fontSize: "0.95rem",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
                }}
              />

              {currentPersistedAnalysis?.analysis_id && (
                <div style={{ flexBasis: "100%", marginTop: "0.25rem", color: "#374151", fontSize: "0.9rem" }}>
                  <strong>Selected analysis:</strong>{" "}
                  <code>{truncateMiddle(currentPersistedAnalysis.analysis_id, 10, 10)}</code>
                  {" · "}
                  <span>{currentPersistedAnalysis.query_text || "(query unknown)"}</span>
                  {" · "}
                  <span>
                    score:{" "}
                    {typeof currentPersistedAnalysis.coherence_score === "number"
                      ? currentPersistedAnalysis.coherence_score
                      : "?"}
                  </span>
                  {" · "}
                  <span>
                    created:{" "}
                    {currentPersistedAnalysis.created_at
                      ? new Date(currentPersistedAnalysis.created_at).toLocaleString()
                      : "?"}
                  </span>
                </div>
              )}

              {!currentPersistedAnalysis?.analysis_id && !analysisIdInput.trim() && (
                <div style={{ flexBasis: "100%", marginTop: "0.25rem", color: "#6b7280", fontSize: "0.9rem" }}>
                  Run and persist an analysis first, or enter an <code>analysis_id</code> manually.
                </div>
              )}

              <button
                type="button"
                onClick={generateAnimocaBrief}
                disabled={animocaLoading || !(analysisIdInput.trim() || currentPersistedAnalysis?.analysis_id)}
                style={{
                  padding: "0.75rem 1rem",
                  background: animocaLoading ? "#9ca3af" : "linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: "12px",
                  fontWeight: 700,
                  cursor: animocaLoading ? "not-allowed" : "pointer",
                }}
              >
                {animocaLoading ? "Generating…" : "Generate Animoca Brief"}
              </button>

              <button
                type="button"
                onClick={copyAnimocaBrief}
                disabled={!animocaBrief}
                style={{
                  padding: "0.75rem 1rem",
                  background: animocaBrief ? "white" : "#f3f4f6",
                  color: "#111827",
                  border: "2px solid #e5e7eb",
                  borderRadius: "12px",
                  fontWeight: 700,
                  cursor: animocaBrief ? "pointer" : "not-allowed",
                }}
              >
                Copy Animoca Brief
              </button>

              <button
                type="button"
                onClick={sendAnimocaEmail}
                disabled={animocaSendLoading || !(analysisIdInput.trim() || currentPersistedAnalysis?.analysis_id)}
                style={{
                  padding: "0.75rem 1rem",
                  background: animocaSendLoading ? "#9ca3af" : "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: "12px",
                  fontWeight: 800,
                  cursor: animocaSendLoading ? "not-allowed" : "pointer",
                }}
              >
                {animocaSendLoading ? "Sending…" : "Send to Mind"}
              </button>
            </div>

            {animocaStatus && (
              <div style={{ marginTop: "0.75rem", fontSize: "0.9rem", color: "#374151" }}>
                {animocaStatus}
              </div>
            )}

            {animocaBrief && (
              <div style={{ marginTop: "0.75rem" }}>
                <div style={{ fontSize: "0.85rem", color: "#6b7280", marginBottom: "0.25rem" }}>
                  To: <code>{animocaBrief.to || "evidence.intelligence.engine@amind.ai"}</code>
                </div>
                <div style={{ fontSize: "0.85rem", color: "#6b7280", marginBottom: "0.5rem" }}>
                  Subject: <code>{animocaBrief.subject}</code>
                </div>
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    padding: "0.9rem",
                    borderRadius: "12px",
                    background: "white",
                    border: "1px solid #e5e7eb",
                    fontSize: "0.85rem",
                    lineHeight: 1.55,
                    maxHeight: "320px",
                    overflow: "auto",
                  }}
                >
                  {animocaBrief.body_text}
                </pre>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div style={{
            marginTop: "1.5rem",
            padding: "1rem",
            background: "#fee2e2",
            border: "1px solid #fecaca",
            borderRadius: "12px",
            color: "#dc2626"
          }}>
            {error}
          </div>
        )}

        {/* Menu / Product Descriptions Modal */}
        {((descriptionModalType === "menu" && menuDescriptions?.length) || (descriptionModalType === "product" && productDescriptions?.length)) && (() => {
          const descriptions = descriptionModalType === "menu" ? menuDescriptions! : productDescriptions!;
          const isProduct = descriptionModalType === "product";
          const which = descriptionModalType;
          const closeModal = () => {
            setDescriptionModalType(null);
            if (which === "menu") setMenuDescriptions(null);
            else setProductDescriptions(null);
          };
          return (
          <>
            <div
              onClick={closeModal}
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(0, 0, 0, 0.6)",
                backdropFilter: "blur(4px)",
                zIndex: 1000,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "2rem"
              }}
            >
              <div
                onMouseDown={handleModalMouseDown}
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: isProduct ? "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)" : "linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)",
                  backdropFilter: "blur(20px)",
                  borderRadius: "24px",
                  padding: "2rem",
                  maxWidth: "800px",
                  width: "100%",
                  maxHeight: "90vh",
                  overflowY: "auto",
                  boxShadow: isProduct ? "0 20px 60px rgba(14, 165, 233, 0.3), 0 0 0 1px rgba(14, 165, 233, 0.2)" : "0 20px 60px rgba(139, 92, 246, 0.4), 0 0 0 1px rgba(139, 92, 246, 0.2)",
                  position: modalPosition ? "absolute" : "relative",
                  left: modalPosition ? `${modalPosition.x}px` : undefined,
                  top: modalPosition ? `${modalPosition.y}px` : undefined,
                  transform: modalPosition ? undefined : undefined,
                  zIndex: 1001,
                  cursor: isDragging ? "grabbing" : "grab",
                  border: isProduct ? "2px solid #38bdf8" : "2px solid #c084fc"
                }}
              >
                <button
                  onClick={closeModal}
                  style={{
                    position: "absolute",
                    top: "1rem",
                    right: "1rem",
                    background: "transparent",
                    border: "none",
                    fontSize: "1.5rem",
                    cursor: "pointer",
                    color: "#6b7280",
                    width: "32px",
                    height: "32px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "8px",
                    transition: "all 0.2s"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#f3f4f6";
                    e.currentTarget.style.color = "#1f2937";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "#6b7280";
                  }}
                >
                  ×
                </button>

                <div
                  style={{
                    marginBottom: "1.5rem",
                    paddingRight: "2.5rem",
                    cursor: "grab",
                    userSelect: "none"
                  }}
                  onMouseDown={(e) => { e.stopPropagation(); handleModalMouseDown(e); }}
                >
                  <h2 style={{
                    margin: "0 0 0.5rem 0",
                    fontSize: "1.75rem",
                    fontWeight: 800,
                    background: isProduct ? "linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)" : "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text"
                  }}>
                    {isProduct ? "Product Descriptions" : "Spa Menu Descriptions"}
                  </h2>
                  <p style={{ margin: 0, fontSize: "0.95rem", color: "#6b7280" }}>
                    Based on: <strong style={{ color: "#374151" }}>{query}</strong>
                  </p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  {descriptions.map((desc, idx) => {
                    // Parse title and description from the text
                    // Format: "**Title**\nDescription paragraph" or "**Title** Description paragraph"
                    const titleMatch = desc.match(/\*\*(.+?)\*\*/);
                    const title = titleMatch ? titleMatch[1] : null;
                    const description = title 
                      ? desc.replace(/\*\*.+?\*\*\s*/, '').trim()
                      : desc;
                    
                    return (
                      <div key={idx} style={{
                        padding: "1.5rem",
                        background: "white",
                        borderRadius: "16px",
                        border: isProduct ? "2px solid #7dd3fc" : "2px solid #d8b4fe",
                        fontSize: "1rem",
                        lineHeight: 1.8,
                        color: "#374151",
                        boxShadow: isProduct ? "0 2px 8px rgba(14, 165, 233, 0.15)" : "0 2px 8px rgba(139, 92, 246, 0.15)"
                      }}>
                        <div style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "0.75rem"
                        }}>
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "28px",
                            height: "28px",
                            borderRadius: "50%",
                            background: isProduct ? "linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)" : "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
                            color: "white",
                            fontWeight: 700,
                            fontSize: "0.875rem",
                            flexShrink: 0
                          }}>
                            {idx + 1}
                          </span>
                          <div style={{ flex: 1 }}>
                            {title && (
                              <h4 style={{
                                margin: "0 0 0.75rem 0",
                                fontSize: "1.125rem",
                                fontWeight: 700,
                                color: isProduct ? "#0284c7" : "#7c3aed",
                                lineHeight: 1.4
                              }}>
                                {title}
                              </h4>
                            )}
                            <div style={{
                              fontSize: "0.95rem",
                              lineHeight: 1.8,
                              color: "#374151",
                              whiteSpace: "pre-wrap"
                            }}>
                              {description || desc}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
          );
        })()}

        {result && (
          <div style={{ marginTop: "2rem" }}>
            {/* Score and metadata card */}
            <div style={{
              padding: "1.5rem",
              background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
              borderRadius: "16px",
              marginBottom: "1.5rem",
              border: "1px solid #e2e8f0",
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "3rem", flexWrap: "wrap" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                  <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", lineHeight: 1.2 }}>
                    Evidence Coherence Score
                  </p>
                  <p style={{ margin: "0.25rem 0 0 0", fontSize: "2rem", fontWeight: 800, background: result.coherence_score >= 80 ? "linear-gradient(135deg, #10b981 0%, #059669 100%)" : result.coherence_score >= 60 ? "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)" : "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", lineHeight: 1.2 }}>
                    {result.coherence_score}/100
                  </p>
                </div>
                {result.evidence_flags && result.evidence_flags.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                    <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", lineHeight: 1.2 }}>
                      Flags Triggered
                    </p>
                    <p style={{ margin: "0.25rem 0 0 0", fontSize: "1.5rem", fontWeight: 700, color: "#b45309", lineHeight: 1.2 }}>
                      {result.evidence_flags.length}
                    </p>
                  </div>
                )}
                {/* PubMed Evidence: always show when we have a result so user knows we ran the check */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                  <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", lineHeight: 1.2 }}>
                    PubMed Evidence
                  </p>
                  <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.9rem", fontWeight: 600, lineHeight: 1.2 }}>
                    {result.pubmed_summary
                      ? `${result.pubmed_summary.rct_count} RCTs · ${result.pubmed_summary.meta_analysis_count} Meta-analyses`
                      : "Unavailable"}
                  </p>
                </div>
              </div>
              {result.evidence_flags && result.evidence_flags.length > 0 && transparencyOn && (
                <div style={{ marginTop: "1.5rem", paddingTop: "1.5rem", borderTop: "1px solid #e2e8f0" }}>
                  <p style={{ margin: "0 0 0.75rem 0", fontSize: "0.875rem", fontWeight: 600, color: "#374151" }}>
                    Evidence Flags:
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {result.evidence_flags.map((f, i) => {
                      const color = FLAG_COLORS[i % FLAG_COLORS.length];
                      return (
                        <div key={i} style={{
                          padding: "0.75rem 1rem",
                          background: color.bg,
                          border: `2px solid ${color.border}`,
                          borderRadius: "8px",
                          fontSize: "0.875rem",
                          color: color.text,
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "0.5rem"
                        }}>
                          <span style={{ 
                            display: "inline-block", 
                            width: "10px", 
                            height: "10px", 
                            borderRadius: "50%", 
                            background: color.dotColor,
                            marginRight: "0.5rem",
                            flexShrink: 0
                          }}></span>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontWeight: 700 }}>[{f.type}]</span> −{f.penalty}: {f.message}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Three panels landscape layout */}
            <div style={{ 
              display: "flex", 
              gap: "1rem", 
              flexWrap: "nowrap", 
              width: "100%", 
              overflowX: "auto",
              overflowY: "hidden",
              boxSizing: "border-box",
              paddingBottom: "0.5rem"
            }}
            onScroll={(e) => {
              // Smooth scrolling
              e.currentTarget.style.scrollBehavior = "smooth";
            }}
            >
              {/* Panel 1: Raw Output */}
              <div style={{
                flex: "0 0 auto",
                width: "calc(33.33% - 0.67rem)",
                minWidth: "400px",
                maxWidth: "600px",
                padding: "1.5rem",
                border: "2px solid #c7d2fe",
                borderRadius: "16px",
                background: "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)",
                boxShadow: "0 4px 6px rgba(99, 102, 241, 0.1)",
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden"
              }}>
                <h2 style={{
                  fontSize: "1.125rem",
                  fontWeight: 700,
                  marginBottom: "1rem",
                  marginTop: 0,
                  color: "#1f2937",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem"
                }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#6b7280", display: "inline-block" }}></span>
                  Raw Output
                </h2>
                <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  <div 
                    style={{
                      whiteSpace: "pre-wrap",
                      fontFamily: "inherit",
                      margin: 0,
                      fontSize: "0.875rem",
                      lineHeight: 1.7,
                      flex: 1,
                      overflowY: "auto",
                      overflowX: "hidden",
                      padding: "1rem",
                      background: "white",
                      borderRadius: "12px",
                      border: "1px solid #c7d2fe",
                      color: "#374151",
                      minHeight: 0
                    }}
                    dangerouslySetInnerHTML={{ __html: rawOutputWithFlags.text }}
                  />
                </div>
              </div>

              {/* Panel 2: Claims Extracted */}
              <div style={{
                flex: "0 0 auto",
                width: "calc(33.33% - 0.67rem)",
                minWidth: "400px",
                maxWidth: "600px",
                padding: "1.5rem",
                border: "2px solid #fed7aa",
                borderRadius: "16px",
                background: "linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)",
                boxShadow: "0 4px 6px rgba(249, 115, 22, 0.1)",
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden"
              }}>
                <h2 style={{
                  fontSize: "1.125rem",
                  fontWeight: 700,
                  marginBottom: "1rem",
                  marginTop: 0,
                  color: "#1f2937",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem"
                }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#3b82f6", display: "inline-block" }}></span>
                  Claims Extracted
                </h2>
                {result.claims && result.claims.length > 0 ? (
                  <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0 }}>
                    {result.claims.map((c, i) => {
                      const flagForClaim = result.evidence_flags?.find(f => f.claim_index === i);
                      const flagIndex = flagForClaim ? result.evidence_flags!.indexOf(flagForClaim) : -1;
                      const color = flagIndex >= 0 ? FLAG_COLORS[flagIndex % FLAG_COLORS.length] : null;
                      const claimStudyData = result.claim_study_data?.find(d => d.claim_index === i);
                      
                      return (
                        <ClaimCardWrapper
                          key={i}
                          claim={c}
                          color={color}
                          studyData={claimStudyData}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: "0.875rem", color: "#9ca3af", fontStyle: "italic" }}>
                    No claims extracted
                  </p>
                )}
              </div>

              {/* Panel 3: Guarded Output */}
              <div style={{
                flex: "0 0 auto",
                width: "calc(33.33% - 0.67rem)",
                minWidth: "400px",
                maxWidth: "600px",
                padding: "1.5rem",
                border: "2px solid #10b981",
                borderRadius: "16px",
                background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
                boxShadow: "0 4px 6px rgba(16, 185, 129, 0.1)",
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                height: "fit-content",
                maxHeight: "800px"
              }}>
                <h2 style={{
                  fontSize: "1.125rem",
                  fontWeight: 700,
                  marginBottom: "1rem",
                  marginTop: 0,
                  color: "#065f46",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem"
                }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981", display: "inline-block" }}></span>
                  Guarded Output
                </h2>
                <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
                  <pre style={{
                    whiteSpace: "pre-wrap",
                    fontFamily: "inherit",
                    margin: 0,
                    fontSize: "0.875rem",
                    lineHeight: 1.7,
                    flex: 1,
                    overflowY: "auto",
                    overflowX: "hidden",
                    padding: "1rem",
                    background: "white",
                    borderRadius: "12px",
                    border: "1px solid #86efac",
                    color: "#374151",
                    minHeight: 0
                  }}>
                    {result.guarded_response}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
