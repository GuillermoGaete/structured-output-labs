"use client";

/**
 * One of the talk figures as a full-bleed slide. `<object>` (not `<img>`) so the
 * SVG can load its own web fonts from /fonts; the PNG is the fallback.
 */
export function FigureSlide({ src, alt }: { src: string; alt: string }) {
  const base = src.replace(/\.(svg|png)$/, "");
  return (
    <div className="slide-figure" aria-label={alt} role="img">
      <object type="image/svg+xml" data={`/figures/${base}.svg`} className="slide-figure-object" tabIndex={-1}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/figures/${base}.png`} alt={alt} width={1920} height={1080} />
      </object>
    </div>
  );
}
