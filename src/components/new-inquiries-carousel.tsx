"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type NewInquiriesCarouselProps = {
  children: ReactNode;
};

export function NewInquiriesCarousel({ children }: NewInquiriesCarouselProps) {
  const scrollerRef = useRef<HTMLUListElement>(null);
  const [canScrollBackward, setCanScrollBackward] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(false);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const updateScrollState = () => {
      const maxScroll = scroller.scrollWidth - scroller.clientWidth;
      setCanScrollBackward(scroller.scrollLeft > 4);
      setCanScrollForward(scroller.scrollLeft < maxScroll - 4);
    };

    updateScrollState();
    scroller.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);

    return () => {
      scroller.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [children]);

  function scrollByPage(direction: -1 | 1) {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    scroller.scrollBy({
      left: direction * Math.max(scroller.clientWidth * 0.82, 280),
      behavior: "smooth",
    });
  }

  return (
    <div className="mt-3">
      <div className="mb-2 flex justify-end gap-2">
        <button
          type="button"
          aria-label="Scroll inquiries left"
          disabled={!canScrollBackward}
          onClick={() => scrollByPage(-1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-300 bg-white text-emerald-800 shadow-sm transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Scroll inquiries right"
          disabled={!canScrollForward}
          onClick={() => scrollByPage(1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-300 bg-white text-emerald-800 shadow-sm transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <ul
        ref={scrollerRef}
        className="new-inquiries-carousel flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-2"
      >
        {children}
      </ul>
    </div>
  );
}
