import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Archivo's width axis gives us trail-sign condensed and readable body from one family.
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin", "latin-ext"], axes: ["wdth"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

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
    { media: "(prefers-color-scheme: light)", color: "#f1f1ed" },
    { media: "(prefers-color-scheme: dark)", color: "#121210" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IE" className={`${archivo.variable} ${plexMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var d=document.documentElement,t=localStorage.getItem("return-route.theme");if(t==="light"||t==="dark")d.dataset.theme=t;var s=JSON.parse(localStorage.getItem("return-route.settings")||"{}");if(s.mode==="cause"||/[?&]demo/.test(location.search))d.dataset.mode="cause"}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
