import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const description =
  "Plan a walk that pays: a loop through the spots where cans and bottles get left behind, ending at a deposit return machine. Powered by open-weight Gemma, on your phone if you like.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "https://return-route.onrender.com"),
  title: "Return Route · A walk that pays",
  description,
  applicationName: "Return Route",
  appleWebApp: { capable: true, title: "Return Route", statusBarStyle: "default" },
  openGraph: { title: "Return Route", description, type: "website", locale: "en_IE" },
  twitter: { card: "summary_large_image", title: "Return Route", description },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#edf1ec" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1611" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IE" className={`${geist.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("return-route.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
