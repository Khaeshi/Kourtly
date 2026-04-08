import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Providers from './components/Providers';
import { Analytics } from "@vercel/analytics/next"
import { APP_NAME } from "@/lib/config"
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
  title: APP_NAME,
  description: `Find the nearest and recommended courts near you! At PlayKou, 
  experience a convenient place to see available courts near you and book right 
  away your reservations! Or if you are a court owner, you found the right system to manage your court, subscribe now! `,
  manifest: '/manifest.webmanifest',
  themeColor: '#3b82f6',
  icons: {
    icon: '/icons/icon-192.svg',
    apple: '/icons/icon-192.svg',
  },
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
