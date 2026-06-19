import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FootyRush",
  description: "A community football draft game with live minileagues."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('footyrush.theme');if(t!=='light'&&t!=='dark'){t='dark';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
