import type { Metadata } from "next";
import { Plus_Jakarta_Sans, DM_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// Friendly, geometric, highly readable sans — professional with a touch of
// roundness. Used for both display and body to keep the look minimal.
const display = Plus_Jakarta_Sans({
  variable: "--font-display",
  weight: ["600", "700", "800"],
  subsets: ["latin"],
});

const body = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

// Clean mono for timestamps, counts, and tag-like labels.
const mono = DM_Mono({
  variable: "--font-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EarlyBird — fresh internships, first light",
  description:
    "The newest SWE / ML / data / PM internship postings, surfaced within hours of going live.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
      style={{ colorScheme: "dark" }}
    >
      <body className="min-h-full">
        {children}
        {/* Cookieless, privacy-friendly traffic analytics (Vercel dashboard). */}
        <Analytics />
      </body>
    </html>
  );
}
