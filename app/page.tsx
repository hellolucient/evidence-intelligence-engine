"use client";

import { DashboardView } from "@/components/dashboard/DashboardView";

export default function Home() {
  return (
    <main style={{
      minHeight: "100vh",
      padding: "1rem",
      maxWidth: "100vw",
      margin: 0,
      width: "100%",
      overflowX: "hidden",
      boxSizing: "border-box",
    }}>
      <div style={{
        maxWidth: "100%",
        margin: "0 auto",
        padding: "0 1rem",
        width: "100%",
        boxSizing: "border-box",
      }}>
        <DashboardView />
      </div>
    </main>
  );
}
