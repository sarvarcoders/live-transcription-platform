import Image from "next/image";

export function BrandLogo() {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="relative h-12 w-[4.75rem] shrink-0 sm:h-14 sm:w-[5.5rem]">
        <Image
          src="/brand/livelingo-mark.png"
          alt="LiveLingo logo mark"
          fill
          sizes="(max-width: 640px) 76px, 88px"
          priority
          className="object-contain drop-shadow-[0_10px_20px_rgba(14,165,233,0.16)]"
        />
      </div>

      <div className="min-w-0">
        <div className="relative inline-flex items-baseline">
          <span className="relative font-display text-[1.65rem] font-extrabold leading-none tracking-[-0.04em] text-[#061a36] dark:text-white sm:text-[2rem]">
            Live
            <span className="bg-gradient-to-r from-[#079cff] via-[#164dff] to-[#7b28ef] bg-clip-text pl-1.5 text-transparent">
              Lingo
            </span>
          </span>
        </div>

        <div className="mt-1.5 hidden items-center gap-1.5 font-display text-[0.56rem] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-300 sm:flex">
          <span>Speak</span>
          <span className="h-1 w-1 rounded-full bg-cyan-400" />
          <span>Translate</span>
          <span className="h-1 w-1 rounded-full bg-violet-500" />
          <span>Connect</span>
        </div>
      </div>
    </div>
  );
}
