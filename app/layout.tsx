import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Evidence Intelligence Engine",
  description: "Evidence-calibrated longevity and biohacking intelligence",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ overflowX: "hidden", width: "100%" }}>
      <body style={{ 
        margin: 0, 
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)",
        minHeight: "100vh",
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
        position: "relative",
        overflowX: "hidden",
        width: "100%",
        boxSizing: "border-box"
      }}>
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "radial-gradient(circle at 20% 50%, rgba(59, 130, 246, 0.15) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(139, 92, 246, 0.15) 0%, transparent 50%)",
          pointerEvents: "none",
          zIndex: 0
        }}></div>
        {children}
      </body>
    </html>
  );
}
