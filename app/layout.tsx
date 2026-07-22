import type { Metadata } from "next";
import { Barlow_Condensed, Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

const displayFont = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-display",
  display: "swap"
});

const uiFont = Inter({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap"
});

const siteDescription = "Draft your XI, take on iconic Premier League seasons, and chase an unbeaten campaign.";

export const metadata: Metadata = {
  metadataBase: new URL("https://footyrush-bay.vercel.app"),
  title: {
    default: "FootyRush — Draft your XI",
    template: "%s | FootyRush"
  },
  description: siteDescription,
  applicationName: "FootyRush",
  alternates: {
    canonical: "/"
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "FootyRush",
    title: "FootyRush — Draft your XI",
    description: siteDescription,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "FootyRush football draft game"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "FootyRush — Draft your XI",
    description: siteDescription,
    images: ["/og.png"]
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${displayFont.variable} ${uiFont.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('footyrush.theme');if(t!=='light'&&t!=='dark'){t='dark';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`
          }}
        />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
