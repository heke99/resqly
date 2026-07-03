"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ textAlign: "center", paddingTop: 48 }}>
      <h1 style={{ fontSize: 24 }}>Något gick fel</h1>
      <p style={{ opacity: 0.72 }}>
        Vi kunde inte visa sidan just nu. Försök igen — om problemet kvarstår, kontakta support.
      </p>
      <button className="bigbtn" onClick={() => reset()}>
        Försök igen
      </button>
      <p style={{ marginTop: 16 }}>
        <a href="/">Till startsidan</a>
      </p>
    </div>
  );
}
