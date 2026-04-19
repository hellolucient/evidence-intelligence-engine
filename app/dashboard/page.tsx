"use client";

import Link from "next/link";
import { DashboardView } from "@/components/dashboard/DashboardView";

export default function DashboardPage() {
  return (
    <main style={{ 
      minHeight: "100vh", 
      padding: "1rem", 
      maxWidth: "100vw", 
      margin: 0, 
      width: "100%", 
      overflowX: "hidden",
      boxSizing: "border-box"
    }}>
      <div style={{ 
        maxWidth: "100%", 
        margin: "0 auto", 
        padding: "0 1rem",
        width: "100%",
        boxSizing: "border-box"
      }}>
        <Link href="/" style={{
          fontSize: "0.9rem",
          color: "rgba(255,255,255,0.95)",
          marginBottom: "1rem",
          display: "inline-block",
          textDecoration: "none",
          fontWeight: 600,
          padding: "0.5rem 1rem",
          borderRadius: "8px",
          background: "rgba(255,255,255,0.15)",
          backdropFilter: "blur(10px)",
          transition: "all 0.2s",
          border: "1px solid rgba(255,255,255,0.2)"
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.25)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.15)";
        }}
        >
          ← Demo (guarded only)
        </Link>
        <DashboardView />
      </div>
    </main>
  );
}
