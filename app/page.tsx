"use client";

import Link from "next/link";
import { DemoApp } from "@/components/demo/DemoApp";

export default function Home() {
  return (
    <main style={{ minHeight: "100vh", padding: "1.5rem", maxWidth: 720, margin: "0 auto" }}>
      <Link href="/dashboard" style={{
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
        → Dashboard (transparency view)
      </Link>
      <DemoApp />
    </main>
  );
}
