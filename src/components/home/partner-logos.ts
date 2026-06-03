export type PartnerLogo = {
  /** Public URL path */
  src: string;
  alt: string;
};

const PARTNER_LOGO_DIR = "/partner_logo";

/** Narrow no-break space used in screenshot filenames on disk. */
const NBSP = "\u202f";

function partnerLogoPath(filename: string): string {
  return `${PARTNER_LOGO_DIR}/${encodeURIComponent(filename)}`;
}

function partnerAlt(filename: string): string {
  return filename
    .replace(/\.(png|jpe?g|ai)$/i, "")
    .replace(/^Screenshot 2024-05-16 at /i, "Partner ")
    .replace(/\u202fpm$/i, " pm")
    .trim();
}

function screenshotAt(time: string): string {
  return `Screenshot 2024-05-16 at ${time}${NBSP}pm.png`;
}

/** All displayable images in public/partner_logo (`.ai` excluded). */
const PARTNER_LOGO_FILES = [
  "AIWT Logo_HiRes.png",
  "Australian Tertiary Institute.png",
  "Logo.jpeg",
  "NITLogo_FullColour_Large1.png",
  "Phoenix Logo (1688 pix).jpeg",
  screenshotAt("3.07.58"),
  screenshotAt("3.08.45"),
  screenshotAt("3.08.52"),
  screenshotAt("3.09.00"),
  screenshotAt("3.09.08"),
  screenshotAt("3.09.16"),
  screenshotAt("3.09.22"),
  screenshotAt("3.09.30"),
  screenshotAt("3.09.39"),
  screenshotAt("3.09.46"),
  screenshotAt("3.09.52"),
  screenshotAt("3.10.00"),
  screenshotAt("3.10.08"),
  screenshotAt("3.10.14"),
  screenshotAt("3.10.21"),
  screenshotAt("3.15.02"),
  screenshotAt("3.18.03"),
  screenshotAt("3.18.41"),
  screenshotAt("3.19.18"),
  screenshotAt("3.20.29"),
  screenshotAt("3.23.46"),
  screenshotAt("3.24.01"),
  screenshotAt("3.25.06"),
  screenshotAt("3.25.45"),
  screenshotAt("3.26.05"),
  screenshotAt("3.26.22"),
  screenshotAt("3.26.55"),
  screenshotAt("3.29.15"),
  screenshotAt("3.43.03"),
  "SHC_LogoCMYK_Lg.jpg",
] as const;

function toPartnerLogo(filename: string): PartnerLogo {
  const isScreenshot = filename.startsWith("Screenshot");
  return {
    src: partnerLogoPath(filename),
    alt: isScreenshot ? "Partner institution" : partnerAlt(filename),
  };
}

export const partnerLogos: PartnerLogo[] = PARTNER_LOGO_FILES.map(toPartnerLogo);

const midpoint = Math.ceil(partnerLogos.length / 2);

export const partnerLogosRowTop = partnerLogos.slice(0, midpoint);
export const partnerLogosRowBottom = partnerLogos.slice(midpoint);
