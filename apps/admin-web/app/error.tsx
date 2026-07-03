"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ textAlign: "center", paddingTop: 64, maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24 }}>Något gick fel</h1>
      <p style={{ opacity: 0.72 }}>Sidan kunde inte visas just nu. Försök igen.</p>
      <button
        onClick={() => reset()}
        style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#0B5FFF", color: "#fff", cursor: "pointer", fontWeight: 600 }}
      >
        Försök igen
      </button>
      <p style={{ marginTop: 16 }}>
        <a href="/">Till översikten</a>
      </p>
    </div>
  );
}
