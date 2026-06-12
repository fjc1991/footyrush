import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FootyRush",
  description: "A community football draft game with live minileagues."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
