"use client";

import { useEffect, useState, type RefObject } from "react";

type UseSectionInViewOptions = {
  threshold?: number;
  rootMargin?: string;
};

export function useSectionInView<T extends HTMLElement>(
  ref: RefObject<T | null>,
  options: UseSectionInViewOptions = {},
) {
  const { threshold = 0.15, rootMargin = "0px" } = options;
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const nextInView = entry.isIntersecting;
        setInView((current) => (current === nextInView ? current : nextInView));
      },
      { threshold, rootMargin },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, threshold, rootMargin]);

  return inView;
}
