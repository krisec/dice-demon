"use client";

import { useState, useEffect, useRef } from "react";

interface Props {
  lastRoll?: { face: number; dieFaceCount: number };
}

function sampleIndices(count: number, from: number): number[] {
  const indices = Array.from({ length: from }, (_, i) => i);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(Math.random() * (indices.length - i));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, count);
}

export function EntryList({ lastRoll }: Props) {
  const [entries, setEntries] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem("dice-demons-entries");
      return stored ? (JSON.parse(stored) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number | undefined>();
  const [candidateIndices, setCandidateIndices] = useState<number[]>([]);
  const [wasSubsampled, setWasSubsampled] = useState(false);

  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  useEffect(() => {
    localStorage.setItem("dice-demons-entries", JSON.stringify(entries));
  }, [entries]);

  useEffect(() => {
    if (!lastRoll || entriesRef.current.length === 0) return;
    const { face, dieFaceCount } = lastRoll;
    const current = entriesRef.current;

    if (dieFaceCount > 0 && current.length > dieFaceCount) {
      const candidates = sampleIndices(dieFaceCount, current.length).sort((a, b) => a - b);
      setSelectedIndex(candidates[face - 1]);
      setCandidateIndices(candidates);
      setWasSubsampled(true);
    } else {
      setSelectedIndex((face - 1) % current.length);
      setCandidateIndices([]);
      setWasSubsampled(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRoll]);

  function addEntry() {
    const trimmed = input.trim();
    if (!trimmed) return;
    setEntries((prev) => [...prev, trimmed]);
    setInput("");
  }

  function removeEntry(index: number) {
    setEntries((prev) => prev.filter((_, i) => i !== index));
    setSelectedIndex((prev) => {
      if (prev === undefined) return undefined;
      if (prev === index) return undefined;
      return prev > index ? prev - 1 : prev;
    });
    setCandidateIndices((prev) =>
      prev
        .filter((c) => c !== index)
        .map((c) => (c > index ? c - 1 : c))
    );
  }

  const selectedEntry =
    selectedIndex !== undefined ? entries[selectedIndex] : undefined;

  return (
    <div className="w-full max-w-sm space-y-4">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
        List
      </h2>

      {/* Result banner */}
      <div
        className={`rounded-2xl border-2 p-5 text-center transition-all duration-300 ${
          selectedEntry
            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40"
            : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/40"
        }`}
      >
        {selectedEntry ? (
          <>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-blue-500 dark:text-blue-400">
              Rolled {lastRoll?.face}
              {wasSubsampled
                ? ` — picked from ${lastRoll?.dieFaceCount} random candidates`
                : " — picked"}
            </p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              {selectedEntry}
            </p>
          </>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500">
            {entries.length === 0
              ? "Add entries, then roll the die"
              : "Roll the die to pick an entry"}
          </p>
        )}
      </div>

      {/* Add entry */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addEntry();
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="New entry…"
          className="flex-1 rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40"
        >
          Add
        </button>
      </form>

      {/* Entries */}
      {entries.length > 0 && (
        <ul className="space-y-2">
          {entries.map((entry, i) => {
            const isSelected = i === selectedIndex;
            const candidatePos = candidateIndices.indexOf(i);
            const isCandidate = candidatePos !== -1;

            return (
              <li
                key={i}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm transition-colors ${
                  isSelected
                    ? "border-blue-500 bg-blue-50 font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                    : isCandidate
                    ? "border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-600 dark:bg-amber-950/30 dark:text-amber-300"
                    : "border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                }`}
              >
                <span className="flex items-center gap-3">
                  <span
                    className={`w-5 text-right text-xs ${
                      isSelected
                        ? "text-blue-400 dark:text-blue-500"
                        : isCandidate
                        ? "font-medium text-amber-500 dark:text-amber-400"
                        : "text-gray-400 dark:text-gray-500"
                    }`}
                  >
                    {isCandidate ? candidatePos + 1 : i + 1}
                  </span>
                  {entry}
                </span>
                <button
                  onClick={() => removeEntry(i)}
                  aria-label={`Remove ${entry}`}
                  className="ml-4 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
