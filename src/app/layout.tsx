import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Live Transcription Studio",
  description: "Real-time speech transcription powered by Deepgram."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
