"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "sans-serif", padding: 32 }}>
        <h1>Something went wrong</h1>
        <p>Reload and try again. If a message was sent, it is saved on the server.</p>
        <button type="button" onClick={() => reset()}>
          Try again
        </button>
      </body>
    </html>
  );
}
