export type PartnerLogo = {
  /** Public URL path */
  src: string;
  alt: string;
};

const PARTNER_LOGO_DIR = "/partner_logo";

function partnerLogoPath(filename: string): string {
  return `${PARTNER_LOGO_DIR}/${encodeURIComponent(filename)}`;
}

function partnerAlt(filename: string): string {
  return filename
    .replace(/\.(png|jpe?g|ai)$/i, "")
    .replace(/^Screenshot 2024-05-16 at /i, "Partner ")
    .trim();
}

/** All displayable partner logos (20 images; `.ai` source excluded). */
export const partnerLogos: PartnerLogo[] = [
  { src: partnerLogoPath("AIWT Logo_HiRes.png"), alt: partnerAlt("AIWT Logo_HiRes.png") },
  {
    src: partnerLogoPath("Australian Tertiary Institute.png"),
    alt: partnerAlt("Australian Tertiary Institute.png"),
  },
  { src: partnerLogoPath("Logo.jpeg"), alt: partnerAlt("Logo.jpeg") },
  {
    src: partnerLogoPath("NITLogo_FullColour_Large1.png"),
    alt: partnerAlt("NITLogo_FullColour_Large1.png"),
  },
  {
    src: partnerLogoPath("Phoenix Logo (1688 pix).jpeg"),
    alt: partnerAlt("Phoenix Logo (1688 pix).jpeg"),
  },
  {
    src: partnerLogoPath("Screenshot 2024-05-16 at 3.15.02\u202fpm.png"),
    alt: "Partner institution",
  },
  {
    src: partnerLogoPath("Screenshot 2024-05-16 at 3.18.03\u202fpm.png"),
    alt: "Partner institution",
  },
  {
    src: partnerLogoPath("Screenshot 2024-05-16 at 3.18.41\u202fpm.png"),
    alt: "Partner institution",
  },
  {
    src: partnerLogoPath("Screenshot 2024-05-16 at 3.19.18\u202fpm.png"),
    alt: "Partner institution",
  },
  {
    src: partnerLogoPath("Screenshot 2024-05-16 at 3.20.29\u202fpm.png"),
    alt: "Partner institution",
  },
  {
    src: partnerLogoPath("Screenshot 2024-05-16 at 3.23.46\u202fpm.png"),
    alt: "Partner institution",
  },
  {
    src: partnerLogoPath("Screenshot 2024-05-16 at 3.24.01\u202fpm.png"),
    alt: "Partner institution",
  },
  {
    src: partnerLogoPath("Screenshot 2024-05-16 at 3.25.06\u202fpm.png"),
    alt: "Partner institution",
  },
  {
    src: partnerLogoPath("Screenshot 2024-05-16 at 3.25.45\u202fpm.png"),
    alt: "Partner institution",
  },
  {
    src: partnerLogoPath("Screenshot 2024-05-16 at 3.26.05\u202fpm.png"),
    alt: "Partner institution",
  },
  {
    src: partnerLogoPath("Screenshot 2024-05-16 at 3.26.22\u202fpm.png"),
    alt: "Partner institution",
  },
  {
    src: partnerLogoPath("Screenshot 2024-05-16 at 3.26.55\u202fpm.png"),
    alt: "Partner institution",
  },
  {
    src: partnerLogoPath("Screenshot 2024-05-16 at 3.29.15\u202fpm.png"),
    alt: "Partner institution",
  },
  {
    src: partnerLogoPath("Screenshot 2024-05-16 at 3.43.03\u202fpm.png"),
    alt: "Partner institution",
  },
  { src: partnerLogoPath("SHC_LogoCMYK_Lg.jpg"), alt: partnerAlt("SHC_LogoCMYK_Lg.jpg") },
];

const midpoint = Math.ceil(partnerLogos.length / 2);

export const partnerLogosRowTop = partnerLogos.slice(0, midpoint);
export const partnerLogosRowBottom = partnerLogos.slice(midpoint);
