import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PwaEnhancer } from "@/app/_components/pwa-enhancer";
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
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Matchr",
  },
  applicationName: "Matchr",
  description: "A private premium social and dating experience.",
  icons: {
    apple: "/apple-touch-icon.png",
    icon: [
      {
        sizes: "192x192",
        type: "image/png",
        url: "/matchr-icon-192.png",
      },
      {
        sizes: "512x512",
        type: "image/png",
        url: "/matchr-icon-512.png",
      },
    ],
  },
  title: "Matchr",
};

export const viewport: Viewport = {
  initialScale: 1,
  themeColor: "#0B1F17",
  viewportFit: "cover",
  width: "device-width",
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
      <body className="flex min-h-full flex-col">
        <PwaEnhancer />
        {children}
      </body>
    </html>
  );
}
