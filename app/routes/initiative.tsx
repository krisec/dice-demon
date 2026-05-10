"use client";

import { useState, useRef, useEffect } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/initiative";
import { requestPixel } from "@systemic-games/pixels-web-connect";
import { usePixelConnect, usePixelEvent } from "@systemic-games/pixels-react";
import type { Pixel } from "@systemic-games/pixels-web-connect";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Initiative — Dice Demons" },
    { name: "description", content: "Track initiative order for your encounter" },
  ];
}

interface Combatant {
  id: number;
  name: string;
  initiative: number;
  roll?: number;
  modifier: number;
  maxHp?: number;
  hp?: number;
}

export default function Initiative() {
  const [combatants, setCombatants] = useState<Combatant[]>(() => {
    try {
      const saved = localStorage.getItem("dice-demons:initiative");
      return saved ? (JSON.parse(saved).combatants ?? []) : [];
    } catch { return []; }
  });
  const [name, setName] = useState("");
  const [modifier, setModifier] = useState<number | "">(0);
  const [hpInput, setHpInput] = useState<number | "">("");
  const [manualInit, setManualInit] = useState<number | "">("");
  const [turnIndex, setTurnIndex] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("dice-demons:initiative");
      return saved ? (JSON.parse(saved).turnIndex ?? 0) : 0;
    } catch { return 0; }
  });
  const [pendingRoll, setPendingRoll] = useState(false);
  // Per-combatant adjustment amounts for the −/+ buttons
  const [adjustAmounts, setAdjustAmounts] = useState<Record<number, number | "">>({});
  const nextIdRef = useRef(1);

  const [pixel, setPixel] = useState<Pixel | undefined>();
  const [connStatus, curPixel, dispatch, connErr] = usePixelConnect(pixel);
  const [rollFace] = usePixelEvent(pixel, "rollFace");
  const [reqErr, setReqErr] = useState<Error | undefined>();

  const isConnected = connStatus === "ready";
  const isBusy = connStatus === "connecting" || connStatus === "identifying" || connStatus === "disconnecting";

  const nameRef = useRef(name);
  nameRef.current = name;
  const modifierRef = useRef(modifier);
  modifierRef.current = modifier;
  const hpInputRef = useRef(hpInput);
  hpInputRef.current = hpInput;
  const pendingRollRef = useRef(pendingRoll);
  pendingRollRef.current = pendingRoll;

  useEffect(() => {
    try {
      localStorage.setItem("dice-demons:initiative", JSON.stringify({ combatants, turnIndex }));
    } catch {}
  }, [combatants, turnIndex]);

  useEffect(() => {
    if (!rollFace || !curPixel || !pendingRollRef.current) return;
    const mod = typeof modifierRef.current === "number" ? modifierRef.current : 0;
    const maxHp = typeof hpInputRef.current === "number" && hpInputRef.current > 0 ? hpInputRef.current : undefined;
    if (!nameRef.current.trim()) return;
    setCombatants(prev => [...prev, {
      id: nextIdRef.current++,
      name: nameRef.current.trim(),
      initiative: rollFace.face + mod,
      roll: rollFace.face,
      modifier: mod,
      maxHp,
      hp: maxHp,
    }]);
    setName("");
    setModifier(0);
    setHpInput("");
    setManualInit("");
    setTurnIndex(0);
    setPendingRoll(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollFace]);

  function addManual() {
    if (!name.trim() || manualInit === "") return;
    const mod = typeof modifier === "number" ? modifier : 0;
    const maxHp = typeof hpInput === "number" && hpInput > 0 ? hpInput : undefined;
    setCombatants(prev => [...prev, {
      id: nextIdRef.current++,
      name: name.trim(),
      initiative: Number(manualInit),
      modifier: mod,
      maxHp,
      hp: maxHp,
    }]);
    setName("");
    setModifier(0);
    setHpInput("");
    setManualInit("");
    setTurnIndex(0);
  }

  function remove(id: number) {
    setCombatants(prev => prev.filter(c => c.id !== id));
    setTurnIndex(0);
  }

  function adjustHp(id: number, delta: number) {
    setCombatants(prev => prev.map(c =>
      c.id === id && c.hp !== undefined && c.maxHp !== undefined
        ? { ...c, hp: Math.max(0, Math.min(c.maxHp, c.hp + delta)) }
        : c
    ));
  }

  async function connectDie() {
    setReqErr(undefined);
    try { setPixel(await requestPixel()); }
    catch (e) { setReqErr(e instanceof Error ? e : new Error(String(e))); }
  }

  function disconnectDie() { dispatch("disconnect"); setPixel(undefined); }

  const sorted = [...combatants].sort((a, b) => b.initiative - a.initiative);

  function isDead(c: Combatant) {
    return c.maxHp !== undefined && c.hp === 0;
  }

  function firstAliveFrom(startIdx: number): number {
    for (let i = 0; i < sorted.length; i++) {
      const idx = (startIdx + i) % sorted.length;
      if (!isDead(sorted[idx])) return idx;
    }
    return startIdx;
  }

  const rawIndex = sorted.length > 0 ? turnIndex % sorted.length : 0;
  const safeIndex = sorted.length > 0 ? firstAliveFrom(rawIndex) : 0;

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-2xl px-4 py-10 space-y-8">

        <div>
          <Link to="/" className="text-sm text-gray-500 hover:text-gray-300">← Back</Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Initiative Tracker</h1>
          <p className="mt-1 text-sm text-gray-500">Add combatants to build your encounter order</p>
        </div>

        {/* Add combatant form */}
        <div className="rounded-2xl border border-gray-700 bg-gray-900 p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-300">Add Combatant</p>

          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && manualInit !== "" && addManual()}
              placeholder="Name"
              className="flex-1 rounded-xl border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-400 focus:outline-none"
            />
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">Mod</span>
              <input
                type="number"
                value={modifier}
                onChange={e => setModifier(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-14 rounded-xl border border-gray-600 bg-gray-800 px-2 py-2 text-center text-sm text-white focus:border-gray-400 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">HP</span>
              <input
                type="number"
                value={hpInput}
                onChange={e => setHpInput(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="—"
                min={1}
                className="w-16 rounded-xl border border-gray-600 bg-gray-800 px-2 py-2 text-center text-sm text-white placeholder-gray-600 focus:border-gray-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="number"
              value={manualInit}
              onChange={e => setManualInit(e.target.value === "" ? "" : Number(e.target.value))}
              onKeyDown={e => e.key === "Enter" && addManual()}
              placeholder="Initiative"
              className="w-28 rounded-xl border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-gray-400 focus:outline-none"
            />
            <button
              disabled={!name.trim() || manualInit === ""}
              onClick={addManual}
              className="rounded-xl border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 disabled:opacity-40"
            >
              Add
            </button>

            <div className="flex-1" />

            {!pixel ? (
              <button onClick={connectDie} className="rounded-xl bg-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-600">
                Connect Die
              </button>
            ) : !isConnected ? (
              <span className="text-xs text-gray-500">{isBusy ? (connStatus ?? "Connecting…") : (
                <button onClick={connectDie} className="rounded-xl bg-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-600">Reconnect</button>
              )}</span>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  disabled={!name.trim() || pendingRoll}
                  onClick={() => setPendingRoll(true)}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-100 disabled:opacity-40"
                >
                  {pendingRoll ? "Rolling…" : "Roll d20"}
                </button>
                {pendingRoll && (
                  <button onClick={() => setPendingRoll(false)} className="text-xs text-gray-500 hover:text-gray-300">
                    Cancel
                  </button>
                )}
                <button onClick={disconnectDie} className="text-xs text-gray-700 hover:text-gray-400">×</button>
              </div>
            )}
          </div>

          {(reqErr || connErr) && (
            <p className="text-xs text-red-400">{(reqErr ?? connErr)!.message}</p>
          )}
          {pendingRoll && name.trim() && (
            <p className="text-xs text-blue-400 animate-pulse">
              Roll your die to set initiative for {name.trim()}…
            </p>
          )}
        </div>

        {/* Initiative order */}
        {sorted.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                Initiative Order
              </p>
              <div className="flex gap-2">
                {sorted.length > 1 && (
                  <button
                    onClick={() => setTurnIndex(firstAliveFrom((safeIndex + 1) % sorted.length))}
                    className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-800"
                  >
                    Next →
                  </button>
                )}
                <button
                  onClick={() => { setCombatants([]); setTurnIndex(0); setPendingRoll(false); }}
                  className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-800"
                >
                  Clear All
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {sorted.map((c, i) => {
                const isActive = i === safeIndex;
                const hpPct = c.maxHp ? (c.hp ?? 0) / c.maxHp : 1;
                const hpColor = hpPct > 0.5 ? "text-green-400" : hpPct > 0.25 ? "text-yellow-400" : "text-red-400";
                const barColor = hpPct > 0.5 ? "bg-green-500" : hpPct > 0.25 ? "bg-yellow-500" : "bg-red-500";
                const adj = adjustAmounts[c.id] ?? 1;

                return (
                  <div
                    key={c.id}
                    className={`rounded-xl border px-4 py-3 transition-colors ${
                      isActive ? "border-yellow-500 bg-yellow-950/30" : "border-gray-800 bg-gray-900"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-5 text-center text-sm font-bold tabular-nums ${isActive ? "text-yellow-400" : "text-gray-600"}`}>
                        {isActive ? "▶" : i + 1}
                      </span>
                      <span className="flex-1 text-sm font-medium">{c.name}</span>

                      {/* HP controls */}
                      {c.maxHp !== undefined && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => adjustHp(c.id, -(typeof adj === "number" ? adj : 1))}
                            className="rounded-md border border-gray-700 px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-800 hover:text-red-400"
                          >
                            Damage
                          </button>
                          <input
                            type="number"
                            value={adj}
                            min={1}
                            onChange={e => setAdjustAmounts(prev => ({
                              ...prev,
                              [c.id]: e.target.value === "" ? "" : Math.max(1, Number(e.target.value)),
                            }))}
                            className="w-14 rounded border border-gray-700 bg-gray-800 text-center text-sm text-gray-300 focus:border-gray-500 focus:outline-none py-0.5"
                          />
                          <button
                            onClick={() => adjustHp(c.id, typeof adj === "number" ? adj : 1)}
                            className="rounded-md border border-gray-700 px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-800 hover:text-green-400"
                          >
                            Heal
                          </button>
                          <div className="ml-1 flex flex-col items-end gap-0.5">
                            <span className={`text-sm font-semibold tabular-nums ${hpColor}`}>
                              {c.hp}/{c.maxHp}
                            </span>
                            <div className="h-1 w-16 rounded-full bg-gray-800">
                              <div
                                className={`h-1 rounded-full transition-all duration-200 ${barColor}`}
                                style={{ width: `${hpPct * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      <span className={`text-xl font-bold tabular-nums ${isActive ? "text-yellow-400" : "text-gray-300"}`}>
                        {c.initiative}
                      </span>
                      {c.roll !== undefined && (
                        <span className="text-xs text-gray-600 tabular-nums">
                          {c.roll}{c.modifier !== 0 ? (c.modifier > 0 ? `+${c.modifier}` : c.modifier) : ""}
                        </span>
                      )}
                      <button onClick={() => remove(c.id)} className="text-gray-700 hover:text-red-400 text-sm leading-none">
                        ×
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
