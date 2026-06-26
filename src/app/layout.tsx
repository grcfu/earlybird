import type { Metadata } from "next";
import { Fraunces, Hanken_Grotesk, Space_Mono } from "next/font/google";
import "./globals.css";

// Wonky, soft display serif for the wordmark + big numbers — characterful and
// editorial, cute when set in italic.
const displaySerif = Fraunces({
  variable: "--font-display",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

// Clean, friendly grotesque for UI/body.
const bodySans = Hanken_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
});

// Characterful mono for timestamps, counts, and tag-like labels.
const mono = Space_Mono({
  variable: "--font-mono",
  weight: ["400", "700"],
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
      style={{ colorScheme: "light" }}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
