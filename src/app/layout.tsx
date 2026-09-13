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
  title: "Empower | Understand your spending",
  description:
    "A private workspace for understanding spending, monthly life expenses, and household costs from exported statements.",
  openGraph: {
    title: "Empower",
    description: "Understand where your money goes.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Empower personal finance workspace" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Empower",
    description: "Understand where your money goes.",
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
