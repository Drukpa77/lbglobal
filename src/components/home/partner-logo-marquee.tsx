import type { PartnerLogo } from "@/components/home/partner-logos";

type PartnerLogoMarqueeProps = {
  logos: PartnerLogo[];
  direction: "left" | "right";
  durationSeconds?: number;
};

function MarqueeLogo({
  logo,
  index,
  originalCount,
}: {
  logo: PartnerLogo;
  index: number;
  originalCount: number;
}) {
  const isDuplicate = index >= originalCount;
  return (
    <li
      className="partner-logo-card flex h-[4.5rem] w-[10.5rem] shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 bg-white px-5 py-3 shadow-[0_8px_30px_rgba(15,23,42,0.06)] transition duration-300 hover:border-slate-300 hover:shadow-[0_12px_40px_rgba(15,23,42,0.1)] sm:h-[5rem] sm:w-[11.5rem]"
      aria-hidden={isDuplicate}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logo.src}
        alt={isDuplicate ? "" : logo.alt}
        className="max-h-full max-w-full object-contain opacity-80 grayscale transition duration-300 hover:opacity-100 hover:grayscale-0"
        loading="lazy"
        decoding="async"
        draggable={false}
      />
    </li>
  );
}

export function PartnerLogoMarquee({
  logos,
  direction,
  durationSeconds = 45,
}: PartnerLogoMarqueeProps) {
  const loop = [...logos, ...logos];
  const style = { ["--partner-marquee-duration" as string]: `${durationSeconds}s` };

  return (
    <div
      className="partner-marquee relative"
      style={style}
      aria-label={direction === "left" ? "Partner logos scrolling left" : "Partner logos scrolling right"}
    >
      <ul
        className={`partner-marquee-track partner-marquee-${direction} m-0 flex list-none items-center gap-4 px-2 py-1 sm:gap-5`}
      >
        {loop.map((logo, index) => (
          <MarqueeLogo
            key={`${logo.src}-${index}`}
            logo={logo}
            index={index}
            originalCount={logos.length}
          />
        ))}
      </ul>
    </div>
  );
}
