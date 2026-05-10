"use client";

import { useState, useRef } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/list";
import { PixelDiceConnector } from "../components/PixelDiceConnector";
import { EntryList } from "../components/EntryList";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Dice List — Dice Demons" },
    { name: "description", content: "Roll your Pixel die to pick from a list!" },
  ];
}

type DieRoll = { face: number; dieFaceCount: number };

export default function List() {
  const [lastRoll, setLastRoll] = useState<DieRoll | undefined>();
  const [diceIds, setDiceIds] = useState<number[]>([0]);
  const nextId = useRef(1);
  const diceRolls = useRef<Record<number, DieRoll>>({});

  function handleDieRoll(id: number, roll: DieRoll) {
    diceRolls.current[id] = roll;
    const rolls = Object.values(diceRolls.current);
    setLastRoll({
      face: rolls.reduce((sum, r) => sum + r.face, 0),
      dieFaceCount: rolls.reduce((sum, r) => sum + r.dieFaceCount, 0),
    });
  }

  function addDie() {
    setDiceIds((prev) => [...prev, nextId.current++]);
  }

  function removeDie(id: number) {
    delete diceRolls.current[id];
    setDiceIds((prev) => prev.filter((d) => d !== id));
  }

  return (
    <main className="flex min-h-screen flex-col items-center px-4 pt-12 pb-16">
      <Link
        to="/"
        className="mb-10 self-start text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        ← Back
      </Link>
      <div className="flex w-full max-w-3xl flex-col items-center gap-12 md:flex-row md:items-start md:justify-center md:gap-16">
        <div className="flex flex-col items-center gap-4">
          {diceIds.map((id, i) => (
            <PixelDiceConnector
              key={id}
              label={`Die ${i + 1}`}
              onRoll={(roll) => handleDieRoll(id, roll)}
              onRemove={diceIds.length > 1 ? () => removeDie(id) : undefined}
            />
          ))}
          <button
            onClick={addDie}
            className="mt-2 rounded-xl border border-dashed border-gray-300 px-6 py-2 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 dark:border-gray-600 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:text-gray-200"
          >
            + Add Die
          </button>
        </div>
        <EntryList lastRoll={lastRoll} />
      </div>
    </main>
  );
}
