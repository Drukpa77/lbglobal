"use client";

import Image from "next/image";
import { useState, type MouseEvent, type WheelEvent } from "react";

type ZoomableImageProps = {
  src: string;
  alt: string;
  previewClassName?: string;
  showHint?: boolean;
};

export function ZoomableImage({
  src,
  alt,
  previewClassName,
  showHint = true,
}: ZoomableImageProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const canZoomOut = zoom > 1;
  const canPan = zoom > 1;

  function zoomIn() {
    setZoom((prev) => Math.min(prev + 0.25, 4));
  }

  function zoomOut() {
    setZoom((prev) => {
      const next = Math.max(prev - 0.25, 1);
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }

  function resetZoom() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function closeModal() {
    setIsOpen(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsDragging(false);
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    setZoom((prev) => {
      const next = Math.min(4, Math.max(1, prev + direction * 0.2));
      if (next === 1) setPan({ x: 0, y: 0 });
      return Number(next.toFixed(2));
    });
  }

  function handleMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (!canPan) return;
    event.preventDefault();
    setIsDragging(true);
    setDragStart({
      x: event.clientX - pan.x,
      y: event.clientY - pan.y,
    });
  }

  function handleMouseMove(event: MouseEvent<HTMLDivElement>) {
    if (!isDragging || !canPan) return;
    setPan({
      x: event.clientX - dragStart.x,
      y: event.clientY - dragStart.y,
    });
  }

  function handleMouseUp() {
    if (isDragging) setIsDragging(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={
          previewClassName ??
          "group relative mt-6 block h-[300px] w-full overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 shadow-sm sm:h-[360px] md:h-[420px]"
        }
        aria-label="Open image zoom viewer"
      >
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1024px"
          className="object-contain p-2 transition duration-300 group-hover:scale-[1.01] md:p-3"
        />
        {showHint && (
          <span className="absolute bottom-3 right-3 rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white">
            Click to zoom
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4">
          <div className="absolute right-4 top-4 flex items-center gap-2">
            <button
              type="button"
              onClick={zoomOut}
              disabled={!canZoomOut}
              className="rounded-md bg-white/90 px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-40"
            >
              -
            </button>
            <button
              type="button"
              onClick={zoomIn}
              className="rounded-md bg-white/90 px-3 py-2 text-sm font-semibold text-slate-800"
            >
              +
            </button>
            <button
              type="button"
              onClick={resetZoom}
              className="rounded-md bg-white/90 px-3 py-2 text-sm font-semibold text-slate-800"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={closeModal}
              className="rounded-md bg-red-500 px-3 py-2 text-sm font-semibold text-white"
            >
              Close
            </button>
          </div>

          <div
            className={`relative h-[80vh] w-[92vw] overflow-hidden rounded-xl bg-slate-950/70 ${
              canPan ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"
            }`}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDoubleClick={resetZoom}
          >
            <div
              className="relative h-full w-full select-none"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "center center",
                transition: isDragging ? "none" : "transform 120ms ease-out",
              }}
            >
              <Image
                src={src}
                alt={alt}
                fill
                sizes="92vw"
                className="pointer-events-none object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

