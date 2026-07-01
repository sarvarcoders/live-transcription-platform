import type { Metadata } from "next";
import { getPublicAppUrl } from "@/lib/site-url";
import "./globals.css";

const appUrl = getPublicAppUrl();

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Live Speech Transcript",
    template: "%s | Live Speech Transcript"
  },
  description:
    "Real-time browser microphone transcription with Deepgram, OpenAI translation, live subtitles, session sharing, and TXT/SRT export.",
  applicationName: "Live Speech Transcript",
  keywords: [
    "live transcription",
    "real-time subtitles",
    "speech to text",
    "Deepgram transcription",
    "OpenAI translation",
    "Uzbek subtitles",
    "English Uzbek translation"
  ],
  authors: [{ name: "Live Speech Transcript" }],
  creator: "Live Speech Transcript",
  publisher: "Live Speech Transcript",
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: "Live Speech Transcript",
    description:
      "Create a live transcription session, stream microphone audio, and show translated subtitles to unlimited viewers.",
    url: "/",
    siteName: "Live Speech Transcript",
    type: "website",
    locale: "en_US"
  },
  twitter: {
    card: "summary_large_image",
    title: "Live Speech Transcript",
    description: "Real-time Deepgram transcription and OpenAI translated subtitles for live sessions."
  },
  robots: {
    index: true,
    follow: true
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
