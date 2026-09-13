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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: "Empower | Personal finance clarity",
  description:
    "A private workspace for importing financial statements, tracing transfers, and understanding spending.",
  openGraph: {
    title: "Empower",
    description: "Your money, connected.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Empower personal finance workspace" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Empower",
    description: "Your money, connected.",
    images: ["/og.png"],
  },
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
