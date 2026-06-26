import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Practice — PDF & Audio",
  description:
    "Read PDFs, annotate with Apple Pencil, and play the lesson audio. Works offline; drawings saved on-device.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Pin the zoom level. Without this, iOS Safari keeps page-level
  // double-tap-to-zoom active and WITHHOLDS the pointerdown for the 2nd of two
  // rapid taps while it waits to see if you're double-tapping — which silently
  // eats every other fast Pencil stroke before JS ever sees it. This app has no
  // need for browser zoom (it has its own fit-width control), so disable it.
  maximumScale: 1,
  userScalable: false,
  // Fit the notch/safe areas on iPad/iOS.
  viewportFit: "cover",
  themeColor: "#f4f4f5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
