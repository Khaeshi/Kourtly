import type { Metadata } from "next";
import { Anton, Manrope, JetBrains_Mono, Geist, Geist_Mono } from "next/font/google";
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

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: `Find the nearest and recommended courts near you! Kourtly offers a conbenient place
  to see available courts near you and book right away your reservations! Or if you are a court owner,
  you found the right system to manage your court, subscribe now! `,
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/Playkoubg.png',
    apple: '/Playkoubg.png',
  },
};

export const viewport = {
  themeColor: '#0B3D3A',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${manrope.variable} ${anton.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <Analytics/>
          <Providers>
            {children}
          </Providers>
      </body>
    </html>
  );
}
