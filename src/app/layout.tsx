import type { Metadata } from "next";
import { Instrument_Serif, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Editorial display serif for the wordmark + big numbers (dawn / characterful).
const displaySerif = Instrument_Serif({
  variable: "--font-display",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

// Clean, slightly warm grotesque for UI/body — deliberately not Inter.
const bodySans = Hanken_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
});

// Mono for timestamps, counts, and the terminal-feed details.
const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EarlyBird — fresh internships, first light",
  description:
    "The newest SWE / ML / data / quant / hardware internship postings, surfaced within hours of going live.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${displaySerif.variable} ${bodySans.variable} ${mono.variable} h-full antialiased`}
      style={{ colorScheme: "dark" }}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
