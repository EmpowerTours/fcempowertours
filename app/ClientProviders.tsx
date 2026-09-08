"use client";

import { useEffect, useState } from "react";
import StandaloneProviders from "./components/StandaloneProviders";
import { captureVia } from "@/lib/via-token";

function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const errorHandler = (event: ErrorEvent) => {
      // Ignore Farcaster context errors in development (expected outside Warpcast)
      if (
        event.message?.includes("Farcaster") ||
        event.message?.includes("context")
      ) {
        console.warn(
          "Farcaster context not available (expected outside Warpcast)",
        );
        return;
      }
      console.error("ErrorBoundary caught:", event.message);
      setHasError(true);
    };
    window.addEventListener("error", errorHandler);
    return () => window.removeEventListener("error", errorHandler);
  }, []);

  if (hasError) {
    return <div>Something went wrong. Please refresh.</div>;
  }
  return <>{children}</>;
}

export default function ClientProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  // Capture a share token the moment anyone arrives, before any in-app navigation can
  // drop it from the URL. The player that credits it runs on a different route.
  useEffect(() => {
    captureVia();
  }, []);

  return (
    <ErrorBoundary>
      <StandaloneProviders>{children}</StandaloneProviders>
    </ErrorBoundary>
  );
}
