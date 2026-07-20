import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { getPublicAppUrl } from "@/lib/site-url";
import "./globals.css";

const appUrl = getPublicAppUrl();
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-montserrat",
  display: "swap"
});

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "LiveLingo",
    template: "%s | LiveLingo"
  },
  description:
    "LiveLingo turns live speech into translated subtitles for shared sessions in real time.",
  applicationName: "LiveLingo",
  keywords: [
    "live transcription",
    "real-time subtitles",
    "speech to text",
    "Deepgram transcription",
    "OpenAI translation",
    "Uzbek subtitles",
    "English Uzbek translation",
    "LiveLingo"
  ],
  authors: [{ name: "LiveLingo" }],
  creator: "LiveLingo",
  publisher: "LiveLingo",
  icons: {
    icon: "/brand/livelingo-mark.png",
    shortcut: "/brand/livelingo-mark.png",
    apple: "/brand/livelingo-mark.png"
  },
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: "LiveLingo",
    description:
      "Create a live transcription session, stream microphone audio, and show translated subtitles to unlimited viewers.",
    url: "/",
    siteName: "LiveLingo",
    type: "website",
    locale: "en_US"
  },
  twitter: {
    card: "summary_large_image",
    title: "LiveLingo",
    description: "Speak, translate, and connect with real-time translated subtitles."
  },
  robots: {
    index: true,
    follow: true
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={montserrat.variable}>{children}</body>
    </html>
  );
}
