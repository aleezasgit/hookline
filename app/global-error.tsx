"use client";

import { useEffect } from "react";

// Only fires if the root layout itself throws, so this can't rely on AppShell,
// Tailwind's design tokens being mounted correctly, or any other app chrome.
// It replaces <html> and <body> entirely while active.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Root layout error boundary:", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ background: "#000", color: "#f5f5f5", fontFamily: "system-ui, sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            textAlign: "center",
            padding: 24,
          }}
        >
          <p style={{ fontSize: 14, color: "#9a9a9a" }}>
            Something went wrong{error.digest ? ` (ref ${error.digest})` : ""}. Try again.
          </p>
          <button
            onClick={() => reset()}
            style={{
              background: "#d1fe17",
              color: "#000",
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
