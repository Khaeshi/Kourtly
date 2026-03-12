import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Providers from './components/Providers';
import { Analytics } from "@vercel/analytics/next"
import "./styles/globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "South City Badminton Court",
  description: "South City Recreation Center",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Analytics/>
          <Providers>
            {children}
          </Providers>
      </body>
    </html>
  );
}
