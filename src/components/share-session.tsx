"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { Check, Copy, QrCode, Users } from "lucide-react";
import type { UiCopy } from "@/lib/i18n";
import type { SessionSummary } from "@/shared/types";

export function ShareSession({ session, copy }: { session: SessionSummary; copy: UiCopy }) {
  const [shareUrl, setShareUrl] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const viewerUrl = `${window.location.origin}?session=${encodeURIComponent(session.code)}`;
    setShareUrl(viewerUrl);
    QRCode.toDataURL(viewerUrl, {
      width: 180,
      margin: 1,
      color: { dark: "#07172e", light: "#ffffff" }
    })
      .then(setQrCodeUrl)
      .catch(() => setQrCodeUrl(""));
  }, [session.code]);

  async function copyViewerLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="grid gap-3 rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-950/55">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-slate-950 dark:text-white">{copy.shareSession}</h2>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <Users className="h-3.5 w-3.5" />
          {session.viewerCount}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-900">
        <div>
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-500">{copy.sessionCode}</p>
          <p className="font-mono text-xl font-bold tracking-[0.14em] text-slate-950 dark:text-white">{session.code}</p>
        </div>
        <button
          type="button"
          onClick={copyViewerLink}
          className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:border-brand-300 hover:text-brand-700 focus:outline-none focus:ring-4 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:focus:ring-brand-500/20"
          aria-label={copy.copyViewerLink}
          title={copy.copyViewerLink}
        >
          {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>

      <button type="button" onClick={copyViewerLink} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700 focus:outline-none focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-500/20">
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? copy.copied : copy.copyViewerLink}
      </button>

      {qrCodeUrl ? (
        <div className="grid place-items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700">
          <Image src={qrCodeUrl} alt={copy.viewerQrAlt} width={152} height={152} unoptimized className="h-[9.5rem] w-[9.5rem]" />
          <p className="inline-flex items-center gap-1.5 text-center text-xs font-medium text-slate-500">
            <QrCode className="h-3.5 w-3.5" />
            {copy.scanToJoin}
          </p>
        </div>
      ) : null}
    </section>
  );
}
