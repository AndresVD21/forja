import Image from "next/image";
import logo192 from "@/assets/logo/app-icon-192.png";
import logo512 from "@/assets/logo/app-icon-512.png";

// The approved artwork (decision 0001), never redrawn. The files are full-bleed squares and
// the platform normally rounds them, so we round the corners ourselves with CSS radius.
// next/image serves a size matching the screen's pixel ratio; the source must be at least
// size x 3 for phones: 40 px -> 120 px (192 file), 96 px -> 288 px (512 file).
// alt="" because "Forja" is always written next to it: a screen reader would say it twice.
const SIZES = {
  sm: { src: logo192, px: 40, className: "size-10 rounded-[10px]" },
  lg: { src: logo512, px: 96, className: "size-24 rounded-[22px]" },
} as const;

export function BrandLogo({ size }: { size: keyof typeof SIZES }) {
  const { src, px, className } = SIZES[size];
  return <Image src={src} alt="" width={px} height={px} sizes={`${px}px`} className={className} priority />;
}
