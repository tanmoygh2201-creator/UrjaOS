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

/**
 * Sets the theme class before first paint (no flash of the wrong theme).
 *
 * Stored preference wins; with no stored value the site defaults to LIGHT
 * (per spec — the sun state is the landing identity). Kept tiny and inline
 * on purpose: this must run before any body content is parsed.
 */
const THEME_INIT = `(function(){try{var t=localStorage.getItem("urja-theme");if(t==="dark"){document.documentElement.classList.add("dark")}}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        {children}
      </body>
    </html>
  );
}
