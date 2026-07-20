import Image from "next/image";

export function BrandLogo() {
  return (
    <div className="flex min-w-0 items-center gap-4 sm:gap-5">
      <div className="relative h-[5rem] w-[8rem] shrink-0 sm:h-[6.25rem] sm:w-[9.75rem]">
        <Image
          src="/brand/livelingo-mark.png"
          alt="LiveLingo logo mark"
          fill
          sizes="(max-width: 640px) 128px, 156px"
          priority
          className="object-contain drop-shadow-[0_18px_30px_rgba(14,165,233,0.22)]"
        />
      </div>

      <div className="min-w-0">
        <div className="relative inline-flex items-baseline">
          <span className="absolute -inset-x-2 bottom-1 h-5 rounded-full bg-gradient-to-r from-sky-400/10 via-blue-500/15 to-violet-500/15 blur-lg" />
          <span className="relative font-display text-[2rem] font-extrabold leading-none tracking-[-0.045em] text-[#061a36] dark:text-white sm:text-[3.25rem]">
            Live
            <span className="bg-gradient-to-r from-[#079cff] via-[#164dff] to-[#7b28ef] bg-clip-text pl-1.5 text-transparent">
              Lingo
            </span>
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 font-display text-[0.56rem] font-semibold uppercase tracking-[0.26em] text-slate-500 dark:text-cyan-100 sm:text-[0.92rem]">
          <span>Speak</span>
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_14px_rgba(34,211,238,0.8)]" />
          <span>Translate</span>
          <span className="h-1.5 w-1.5 rounded-full bg-violet-500 shadow-[0_0_14px_rgba(139,92,246,0.8)]" />
          <span>Connect</span>
        </div>
      </div>
    </div>
  );
}
