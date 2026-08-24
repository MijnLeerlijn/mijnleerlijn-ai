import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Rekenmateriaal maken — demo",
  description:
    "Van leerdoel naar lokaal passend oefenmateriaal voor Aruba en Curaçao.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl" className={inter.variable}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
