"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="tr">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0 }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 22 }}>Bir hata oluştu · Something went wrong</h1>
          <button type="button" onClick={reset} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 8, border: "1px solid #ccd" }}>
            Tekrar dene · Try again
          </button>
        </div>
      </body>
    </html>
  );
}
