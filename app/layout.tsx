import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CookieBanner } from "./components/CookieBanner";
import { PrototypeBanner } from "./components/PrototypeBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Neuridion — Automated PMS Recall Search for EU MDR",
  description: "Neuridion automates mandatory recall database searches for medical device manufacturers under EU MDR Article 83. Run BfArM, FDA, and MHRA searches in minutes, not hours.",
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
      <body className="min-h-full flex flex-col">
        <PrototypeBanner />
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
