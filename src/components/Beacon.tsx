"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Fire-and-forget page-view beacon for the private /stats page. Sends the path
// on each navigation; the server hashes IP+UA (never stored) into a daily
// visitor id. Uses sendBeacon so it survives the page unloading.
export function Beacon() {
  const pathname = usePathname();
  useEffect(() => {
    try {
      const body = JSON.stringify({ path: pathname });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/hit",
          new Blob([body], { type: "application/json" }),
        );
      } else {
        fetch("/api/hit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        });
      }
    } catch {
      /* analytics must never break the app */
    }
  }, [pathname]);
  return null;
}
