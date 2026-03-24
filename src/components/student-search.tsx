"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Student = { id: string; name: string | null; email: string };

export function StudentSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Student[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/students/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.students ?? []);
      setOpen(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => search(query), 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        type="search"
        placeholder="Find student..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        className="w-48 rounded-md border border-slate-300 px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
      />
      {open && (results.length > 0 || loading) && (
        <div className="absolute top-full left-0 z-50 mt-1 w-72 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {loading ? (
            <p className="px-3 py-2 text-sm text-slate-500">Searching...</p>
          ) : (
            results.map((s) => (
              <Link
                key={s.id}
                href={`/dashboard/students/${s.id}`}
                onClick={() => setOpen(false)}
                className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <span className="font-medium">{s.name ?? "No name"}</span>
                <span className="ml-2 text-slate-500">{s.email}</span>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
