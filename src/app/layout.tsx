import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Live Transcription Studio",
  description: "Real-time speech transcription and translation powered by Deepgram and OpenAI."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
