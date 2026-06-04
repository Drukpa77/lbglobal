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
      className="partner-logo-card flex h-[5.25rem] w-[12rem] shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 bg-white px-4 py-2.5 shadow-[0_8px_30px_rgba(15,23,42,0.06)] transition duration-300 hover:border-slate-300 hover:shadow-[0_12px_40px_rgba(15,23,42,0.1)] sm:h-[6.25rem] sm:w-[14rem]"
      aria-hidden={isDuplicate}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logo.src}
        alt={isDuplicate ? "" : logo.alt}
        className="max-h-[3.25rem] max-w-full object-contain sm:max-h-[4rem]"
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
