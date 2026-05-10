"use client";

import { useState, useEffect, useRef } from "react";
import { requestPixel } from "@systemic-games/pixels-web-connect";
import { usePixelConnect, usePixelEvent } from "@systemic-games/pixels-react";
import type { Pixel } from "@systemic-games/pixels-web-connect";
import type { GamePlayer, GamePhase, ModifierType, PlayerClass } from "../../../server/game-logic";
import { CLASS_INFO } from "../../../server/game-logic";
import type { ClientMessage } from "../../../server/protocol";
import { PLAYER_COLORS, MODIFIER_INFO, LARGE_DAMAGE_THRESHOLD, MAX_HP } from "./constants";

export interface SlotProps {
  slotIndex: number;
  player: GamePlayer;
  isMe: boolean;
  phase: GamePhase;
  now: number;
  sendMsg: (msg: ClientMessage) => void;
  onSetClass?: (c: PlayerClass) => void;
}

export function PlayerSlot({ slotIndex, player, isMe, phase, now, sendMsg, onSetClass }: SlotProps) {
  const [pixel, setPixel] = useState<Pixel | undefined>();
  const [reqErr, setReqErr] = useState<Error | undefined>();
  const [connStatus, curPixel, dispatch, connErr] = usePixelConnect(pixel);
  const [rollFace] = usePixelEvent(pixel, "rollFace");
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // Damage animations
  const prevHpRef = useRef(player.hp);
  const [damageEvents, setDamageEvents] = useState<Array<{ id: number; amount: number }>>([]);
  const eventIdRef = useRef(0);
  useEffect(() => {
    const taken = prevHpRef.current - player.hp;
    prevHpRef.current = player.hp;
    if (taken >= LARGE_DAMAGE_THRESHOLD) {
      const id = ++eventIdRef.current;
      setDamageEvents(prev => [...prev.slice(-2), { id, amount: taken }]);
      setTimeout(() => setDamageEvents(prev => prev.filter(e => e.id !== id)), 1400);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.hp]);

  const isConnected = connStatus === "ready";
  const isBusy = connStatus === "connecting" || connStatus === "identifying" || connStatus === "disconnecting";
  const dieName = curPixel?.name || "";

  useEffect(() => {
    if (!isMe) return;
    sendMsg({ type: "die_status", connected: isConnected, dieName: dieName || undefined });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, dieName]);

  useEffect(() => {
    if (!isMe || !rollFace || !curPixel) return;
    if (phaseRef.current !== "playing") return;
    sendMsg({ type: "roll", face: rollFace.face, dieFaceCount: curPixel.dieFaceCount });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollFace]);

  const colors = PLAYER_COLORS[slotIndex];
  const frozenSecs = player.status.frozenUntil > now ? Math.ceil((player.status.frozenUntil - now) / 1000) : 0;

  async function connect() {
    setReqErr(undefined);
    try { setPixel(await requestPixel()); }
    catch (e) { setReqErr(e instanceof Error ? e : new Error(String(e))); }
  }

  function disconnect() { dispatch("disconnect"); setPixel(undefined); }

  // ── Lobby view ──
  if (phase === "lobby-waiting") {
    const cls = CLASS_INFO[player.playerClass];
    const classButtons = (onClick: (c: PlayerClass) => void) => (
      <div className="space-y-1.5">
        <p className="text-xs text-gray-500">Class</p>
        <div className="flex gap-1">
          {(Object.keys(CLASS_INFO) as PlayerClass[]).map(c => {
            const ci = CLASS_INFO[c];
            return (
              <button key={c} title={ci.desc} onClick={() => onClick(c)}
                className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors ${
                  player.playerClass === c
                    ? `${colors.border} ${colors.bg} ${colors.text}`
                    : "border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300"
                }`}>
                {ci.emoji}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-500">{cls.emoji} {cls.name} — {cls.desc}</p>
      </div>
    );

    return (
      <div className={`rounded-2xl border ${colors.border} ${colors.bg} p-5 space-y-3 w-52`}>
        <p className={`text-xs font-semibold uppercase tracking-widest ${colors.text}`}>{player.name}</p>

        {isMe
          ? classButtons(c => sendMsg({ type: "set_class", playerClass: c }))
          : onSetClass
            ? classButtons(onSetClass)
            : <p className="text-xs text-gray-400">{cls.emoji} {cls.name}</p>
        }

        {isMe && (
          !pixel ? (
            <button onClick={connect} className="w-full rounded-lg bg-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-600">
              Connect Die
            </button>
          ) : (
            <div className="space-y-1.5">
              <p className={`text-xs font-medium ${isConnected ? "text-green-400" : "text-gray-400"}`}>
                {isConnected ? `✓ ${dieName || "Die"}` : (connStatus ?? "Connecting…")}
              </p>
              <div className="flex gap-1.5">
                {!isConnected && !isBusy && (
                  <button onClick={connect} className="flex-1 rounded-lg bg-gray-700 px-3 py-1 text-xs text-gray-200 hover:bg-gray-600">
                    Reconnect
                  </button>
                )}
                <button onClick={disconnect} disabled={isBusy} className="flex-1 rounded-lg border border-gray-700 px-3 py-1 text-xs text-gray-500 hover:bg-gray-800 disabled:opacity-40">
                  Disconnect
                </button>
              </div>
            </div>
          )
        )}
        {!isMe && (
          <p className={`text-xs ${player.dieConnected ? "text-green-400" : "text-gray-500"}`}>
            {player.dieConnected ? `✓ ${player.dieName || "Die connected"}` : "No die connected"}
          </p>
        )}
        {(reqErr ?? connErr) && <p className="text-xs text-red-400">{(reqErr ?? connErr)!.message}</p>}
      </div>
    );
  }

  // ── Game view ──
  const hpPct = (player.hp / MAX_HP) * 100;
  const modEntries = Object.entries(player.modifierMap) as [string, ModifierType][];

  return (
    <div className={`relative rounded-2xl border ${colors.border} ${colors.bg} p-5 space-y-3 w-52 ${player.eliminated ? "opacity-40" : ""}`}>
      {frozenSecs > 0 && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-blue-950/80">
          <span className="text-4xl">❄️</span>
          <span className="mt-1 text-xl font-bold text-blue-300">{frozenSecs}s</span>
        </div>
      )}

      {damageEvents.map(e => (
        <div key={e.id} className="pointer-events-none absolute inset-0 z-20">
          <div className="absolute inset-0 rounded-2xl animate-damage-flash" />
          <div className="absolute inset-x-0 top-6 flex justify-center">
            <span className="animate-float-damage text-2xl font-bold text-red-400 drop-shadow-lg">
              -{e.amount}
            </span>
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`font-bold ${colors.text}`}>{player.name}</span>
          <span className="text-sm" title={`${CLASS_INFO[player.playerClass].name} — ${CLASS_INFO[player.playerClass].desc}`}>
            {CLASS_INFO[player.playerClass].emoji}
          </span>
        </div>
        {player.eliminated && <span className="text-xs font-semibold text-red-500">ELIMINATED</span>}
      </div>

      <div>
        <div className="mb-1 flex justify-between text-xs text-gray-500">
          <span>HP</span><span>{player.hp}/{MAX_HP}</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-gray-700">
          <div className={`h-2.5 rounded-full transition-all duration-300 ${colors.bar}`} style={{ width: `${hpPct}%` }} />
        </div>
      </div>

      {(player.status.shieldHp > 0 || player.status.burningRolls > 0 || player.status.poisonedRolls > 0 || player.status.earthquakeReady) && (
        <div className="flex flex-wrap gap-1">
          {player.status.shieldHp > 0 && <span className="rounded border border-gray-400/40 bg-gray-500/20 px-1.5 py-0.5 text-xs text-gray-300">🛡️ {player.status.shieldHp}</span>}
          {player.status.burningRolls > 0 && <span className="rounded border border-orange-400/40 bg-orange-500/20 px-1.5 py-0.5 text-xs text-orange-300">🔥 ×{player.status.burningRolls}</span>}
          {player.status.poisonedRolls > 0 && <span className="rounded border border-green-400/40 bg-green-500/20 px-1.5 py-0.5 text-xs text-green-300">☠️ ×{player.status.poisonedRolls}</span>}
          {player.status.earthquakeReady && <span className="rounded border border-yellow-400/40 bg-yellow-500/20 px-1.5 py-0.5 text-xs text-yellow-300">⚡ ready</span>}
        </div>
      )}

      {player.lastRoll !== undefined && (
        <div className="flex items-center gap-2">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg border ${colors.border} text-lg font-bold text-white`}>
            {player.lastRoll}
          </div>
          <span className="text-xs text-gray-600">last roll</span>
        </div>
      )}

      {modEntries.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-gray-600">Face modifiers</p>
          <div className="flex flex-wrap gap-1">
            {modEntries.map(([face, m]) => (
              <span key={face} className={`rounded border px-1.5 py-0.5 text-xs ${MODIFIER_INFO[m].cls}`}>
                {face}: {MODIFIER_INFO[m].emoji}
              </span>
            ))}
          </div>
        </div>
      )}

      {!player.eliminated && isMe && (
        <div className="border-t border-gray-800 pt-2">
          {!pixel ? (
            <button onClick={connect} className="w-full rounded-lg bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700">
              Connect Die
            </button>
          ) : (
            <div className="flex items-center justify-between">
              <span className={`text-xs ${isConnected ? "text-green-400" : "text-gray-500"}`}>
                {isConnected ? `✓ ${dieName || "Die"}` : (connStatus ?? "—")}
              </span>
              <button onClick={disconnect} disabled={isBusy} className="text-xs text-gray-600 hover:text-gray-400 disabled:opacity-40">
                ×
              </button>
            </div>
          )}
          {(reqErr ?? connErr) && <p className="mt-1 text-xs text-red-400">{(reqErr ?? connErr)!.message}</p>}
        </div>
      )}
      {!player.eliminated && !isMe && (
        <div className="border-t border-gray-800 pt-2">
          <p className={`text-xs ${player.dieConnected ? "text-green-400" : "text-gray-500"}`}>
            {player.dieConnected ? `✓ ${player.dieName || "Die connected"}` : "No die connected"}
          </p>
        </div>
      )}
    </div>
  );
}
