import type { Metadata } from "next";
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
  title: {
    default: "UrjaOS — Optimize Energy. Reduce Cost. Power Smarter.",
    template: "%s | UrjaOS",
  },
  description:
    "UrjaOS is an AI-powered energy management platform that monitors solar generation and electricity consumption, forecasts energy demand, and optimizes battery usage to reduce electricity costs.",
  keywords: [
    "energy management",
    "solar monitoring",
    "battery optimization",
    "energy forecasting",
    "AI energy copilot",
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
