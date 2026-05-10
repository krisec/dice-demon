"use client";

import { useState, useEffect, useRef } from "react";
import { Link } from "react-router";
import { requestPixel } from "@systemic-games/pixels-web-connect";
import { usePixelConnect, usePixelEvent } from "@systemic-games/pixels-react";
import type { Pixel } from "@systemic-games/pixels-web-connect";
import type { Route } from "./+types/hammer-of-wilderwood";

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_HP = 250;
const FIRE_DAMAGE = 8;
const FIRE_ROLLS = 3;
const SHIELD_HP = 25;
const FROST_MS = 8_000;
const POISON_ROLLS = 3;
const SPAWN_INTERVAL_MS = 30_000;

const PLAYER_COLORS = [
  { bg: "bg-rose-950/40",    border: "border-rose-500",    bar: "bg-rose-500",    text: "text-rose-400" },
  { bg: "bg-blue-950/40",    border: "border-blue-500",    bar: "bg-blue-500",    text: "text-blue-400" },
  { bg: "bg-emerald-950/40", border: "border-emerald-500", bar: "bg-emerald-500", text: "text-emerald-400" },
  { bg: "bg-amber-950/40",   border: "border-amber-500",   bar: "bg-amber-500",   text: "text-amber-400" },
];

// ── Types ────────────────────────────────────────────────────────────────────

type ModifierType = "frost" | "fire" | "poison" | "shield" | "earthquake";
type GamePhase = "setup" | "playing" | "gameover";

const MODIFIER_INFO: Record<ModifierType, { name: string; emoji: string; cls: string }> = {
  frost:      { name: "Frost",      emoji: "❄️", cls: "bg-blue-500/20 text-blue-300 border-blue-400/40" },
  fire:       { name: "Fire",       emoji: "🔥", cls: "bg-orange-500/20 text-orange-300 border-orange-400/40" },
  poison:     { name: "Poison",     emoji: "☠️", cls: "bg-green-500/20 text-green-300 border-green-400/40" },
  shield:     { name: "Shield",     emoji: "🛡️", cls: "bg-gray-500/20 text-gray-300 border-gray-400/40" },
  earthquake: { name: "Earthquake", emoji: "⚡", cls: "bg-yellow-500/20 text-yellow-300 border-yellow-400/40" },
};
const ALL_MODIFIERS: ModifierType[] = ["frost", "fire", "poison", "shield", "earthquake"];

interface PlayerStatus {
  frozenUntil: number;
  burningRolls: number;
  poisonedRolls: number;
  shieldHp: number;
  earthquakeReady: boolean;
}

interface GamePlayer {
  id: number;
  name: string;
  hp: number;
  status: PlayerStatus;
  modifierMap: Partial<Record<number, ModifierType>>;
  dieFaceCount: number;
  lastRoll?: number;
  eliminated: boolean;
}

interface GameState {
  playerCount: number;
  phase: GamePhase;
  players: GamePlayer[];
  logs: string[];
}

// ── Pure game logic ──────────────────────────────────────────────────────────

function makePlayer(id: number): GamePlayer {
  return {
    id,
    name: `Player ${id + 1}`,
    hp: MAX_HP,
    status: { frozenUntil: 0, burningRolls: 0, poisonedRolls: 0, shieldHp: 0, earthquakeReady: false },
    modifierMap: {},
    dieFaceCount: 20,
    eliminated: false,
  };
}

function applyDamage(player: GamePlayer, dmg: number): GamePlayer {
  if (dmg <= 0) return player;
  let remaining = dmg;
  let { shieldHp } = player.status;
  if (shieldHp > 0) {
    const absorbed = Math.min(shieldHp, remaining);
    shieldHp -= absorbed;
    remaining -= absorbed;
  }
  const hp = Math.max(0, player.hp - remaining);
  return { ...player, hp, eliminated: hp === 0, status: { ...player.status, shieldHp } };
}

function processRoll(
  players: GamePlayer[],
  rollerId: number,
  face: number,
  dieFaceCount: number,
  now: number,
): { players: GamePlayer[]; logs: string[] } {
  const roller = players.find(p => p.id === rollerId)!;
  const logs: string[] = [];

  if (roller.status.frozenUntil > now) {
    const secs = Math.ceil((roller.status.frozenUntil - now) / 1000);
    logs.push(`❄️ ${roller.name} is frozen! (${secs}s remaining)`);
    return { players, logs };
  }

  let ps = players.map(p => ({ ...p, status: { ...p.status } }));
  const ri = ps.findIndex(p => p.id === rollerId);
  ps[ri] = { ...ps[ri], lastRoll: face, dieFaceCount };

  // Trigger modifier on this face
  const mod = ps[ri].modifierMap[face];
  if (mod) {
    const info = MODIFIER_INFO[mod];
    logs.push(`✨ ${roller.name} rolled ${face} — ${info.emoji} ${info.name}!`);
    const newMap = { ...ps[ri].modifierMap };
    delete newMap[face];
    ps[ri] = { ...ps[ri], modifierMap: newMap };

    const oppIdxs = ps.map((p, i) => i).filter(i => ps[i].id !== rollerId && !ps[i].eliminated);

    switch (mod) {
      case "frost":
        oppIdxs.forEach(i => { ps[i] = { ...ps[i], status: { ...ps[i].status, frozenUntil: now + FROST_MS } }; });
        if (oppIdxs.length) logs.push(`  All opponents frozen for 8s!`);
        break;
      case "fire":
        oppIdxs.forEach(i => { ps[i] = { ...ps[i], status: { ...ps[i].status, burningRolls: ps[i].status.burningRolls + FIRE_ROLLS } }; });
        if (oppIdxs.length) logs.push(`  All opponents are burning! (+${FIRE_DAMAGE} dmg × ${FIRE_ROLLS} rolls)`);
        break;
      case "poison":
        oppIdxs.forEach(i => { ps[i] = { ...ps[i], status: { ...ps[i].status, poisonedRolls: ps[i].status.poisonedRolls + POISON_ROLLS } }; });
        if (oppIdxs.length) logs.push(`  All opponents poisoned! (−50% dmg × ${POISON_ROLLS} rolls)`);
        break;
      case "shield":
        ps[ri] = { ...ps[ri], status: { ...ps[ri].status, shieldHp: ps[ri].status.shieldHp + SHIELD_HP } };
        logs.push(`  🛡️ ${roller.name} gains a ${SHIELD_HP} HP shield!`);
        break;
      case "earthquake":
        ps[ri] = { ...ps[ri], status: { ...ps[ri].status, earthquakeReady: true } };
        logs.push(`  ⚡ ${roller.name} charges an earthquake!`);
        break;
    }
  }

  // Fire DoT tick on roller (they were burned by a previous fire attack)
  if (ps[ri].status.burningRolls > 0) {
    const before = ps[ri];
    ps[ri] = { ...applyDamage(ps[ri], FIRE_DAMAGE), status: { ...ps[ri].status, burningRolls: ps[ri].status.burningRolls - 1 } };
    const absorbed = FIRE_DAMAGE - (before.hp - ps[ri].hp);
    const taken = FIRE_DAMAGE - Math.max(0, absorbed);
    logs.push(`🔥 ${roller.name} takes ${taken} fire damage! (${ps[ri].status.burningRolls} rolls remaining)`);
    if (ps[ri].eliminated) logs.push(`💀 ${roller.name} was eliminated by fire!`);
  }

  if (ps[ri].eliminated) return { players: ps, logs };

  // Compute outgoing damage
  let damage = face;
  if (ps[ri].status.poisonedRolls > 0) {
    damage = Math.floor(damage / 2);
    ps[ri] = { ...ps[ri], status: { ...ps[ri].status, poisonedRolls: ps[ri].status.poisonedRolls - 1 } };
    logs.push(`☠️ ${roller.name} is poisoned — damage halved to ${damage}`);
  }
  if (ps[ri].status.earthquakeReady) {
    damage *= 2;
    ps[ri] = { ...ps[ri], status: { ...ps[ri].status, earthquakeReady: false } };
    logs.push(`⚡ Earthquake! Damage doubled to ${damage}!`);
  }

  // Deal damage to all living opponents
  ps
    .map((p, i) => i)
    .filter(i => ps[i].id !== rollerId && !ps[i].eliminated)
    .forEach(oi => {
      const before = ps[oi];
      ps[oi] = applyDamage(ps[oi], damage);
      const shieldAbsorbed = before.status.shieldHp - ps[oi].status.shieldHp;
      const actualDmg = damage - shieldAbsorbed;
      if (shieldAbsorbed > 0) logs.push(`🛡️ ${before.name}'s shield absorbed ${shieldAbsorbed} damage!`);
      logs.push(`⚔️ ${roller.name} rolled ${face} → ${actualDmg} dmg to ${before.name} (${ps[oi].hp}/${MAX_HP} HP)`);
      if (ps[oi].eliminated) logs.push(`💀 ${before.name} has been eliminated!`);
    });

  return { players: ps, logs };
}

function spawnModifiers(players: GamePlayer[], playerCount: number): GamePlayer[] {
  return players.map((p, i) => {
    if (i >= playerCount || p.eliminated) return p;
    const faceCount = p.dieFaceCount || 20;
    const face = 1 + Math.floor(Math.random() * faceCount);
    const mod = ALL_MODIFIERS[Math.floor(Math.random() * ALL_MODIFIERS.length)];
    return { ...p, modifierMap: { ...p.modifierMap, [face]: mod } };
  });
}

// ── PlayerSlot ───────────────────────────────────────────────────────────────

interface SlotProps {
  slotIndex: number;
  player: GamePlayer;
  phase: GamePhase;
  now: number;
  onNameChange: (name: string) => void;
  onRoll: (face: number, dieFaceCount: number) => void;
}

function PlayerSlot({ slotIndex, player, phase, now, onNameChange, onRoll }: SlotProps) {
  const [pixel, setPixel] = useState<Pixel | undefined>();
  const [reqErr, setReqErr] = useState<Error | undefined>();
  const [connStatus, curPixel, dispatch, connErr] = usePixelConnect(pixel);
  const [rollFace] = usePixelEvent(pixel, "rollFace");
  const onRollRef = useRef(onRoll);
  onRollRef.current = onRoll;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    if (rollFace && curPixel && phaseRef.current === "playing") {
      onRollRef.current(rollFace.face, curPixel.dieFaceCount);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollFace]);

  const colors = PLAYER_COLORS[slotIndex];
  const isConnected = connStatus === "ready";
  const isBusy = connStatus === "connecting" || connStatus === "identifying" || connStatus === "disconnecting";
  const dieName = curPixel?.name || `Die ${slotIndex + 1}`;
  const frozenSecs = player.status.frozenUntil > now ? Math.ceil((player.status.frozenUntil - now) / 1000) : 0;

  async function connect() {
    setReqErr(undefined);
    try { setPixel(await requestPixel()); }
    catch (e) { setReqErr(e instanceof Error ? e : new Error(String(e))); }
  }

  function disconnect() { dispatch("disconnect"); setPixel(undefined); }

  // ── Setup view ──
  if (phase === "setup") {
    return (
      <div className={`rounded-2xl border ${colors.border} ${colors.bg} p-5 space-y-3 w-48`}>
        <p className={`text-xs font-semibold uppercase tracking-widest ${colors.text}`}>Player {slotIndex + 1}</p>
        <input
          type="text"
          value={player.name}
          onChange={e => onNameChange(e.target.value)}
          placeholder={`Player ${slotIndex + 1}`}
          className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:border-gray-400 focus:outline-none"
        />
        {!pixel ? (
          <button onClick={connect} className="w-full rounded-lg bg-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-600">
            Connect Die
          </button>
        ) : (
          <div className="space-y-1.5">
            <p className={`text-xs font-medium ${isConnected ? "text-green-400" : "text-gray-400"}`}>
              {isConnected ? `✓ ${dieName}` : (connStatus ?? "Connecting…")}
            </p>
            <button onClick={disconnect} disabled={isBusy} className="w-full rounded-lg border border-gray-700 px-3 py-1 text-xs text-gray-500 hover:bg-gray-800 disabled:opacity-40">
              Disconnect
            </button>
          </div>
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

      <div className="flex items-center justify-between">
        <span className={`font-bold ${colors.text}`}>{player.name}</span>
        {player.eliminated && <span className="text-xs font-semibold text-red-500">ELIMINATED</span>}
      </div>

      {/* HP bar */}
      <div>
        <div className="mb-1 flex justify-between text-xs text-gray-500">
          <span>HP</span><span>{player.hp}/{MAX_HP}</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-gray-700">
          <div className={`h-2.5 rounded-full transition-all duration-300 ${colors.bar}`} style={{ width: `${hpPct}%` }} />
        </div>
      </div>

      {/* Status effects */}
      {(player.status.shieldHp > 0 || player.status.burningRolls > 0 || player.status.poisonedRolls > 0 || player.status.earthquakeReady) && (
        <div className="flex flex-wrap gap-1">
          {player.status.shieldHp > 0 && <span className="rounded border border-gray-400/40 bg-gray-500/20 px-1.5 py-0.5 text-xs text-gray-300">🛡️ {player.status.shieldHp}</span>}
          {player.status.burningRolls > 0 && <span className="rounded border border-orange-400/40 bg-orange-500/20 px-1.5 py-0.5 text-xs text-orange-300">🔥 ×{player.status.burningRolls}</span>}
          {player.status.poisonedRolls > 0 && <span className="rounded border border-green-400/40 bg-green-500/20 px-1.5 py-0.5 text-xs text-green-300">☠️ ×{player.status.poisonedRolls}</span>}
          {player.status.earthquakeReady && <span className="rounded border border-yellow-400/40 bg-yellow-500/20 px-1.5 py-0.5 text-xs text-yellow-300">⚡ ready</span>}
        </div>
      )}

      {/* Last roll */}
      {player.lastRoll !== undefined && (
        <div className="flex items-center gap-2">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg border ${colors.border} text-lg font-bold text-white`}>
            {player.lastRoll}
          </div>
          <span className="text-xs text-gray-600">last roll</span>
        </div>
      )}

      {/* Modifier map */}
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

      {/* Die connection */}
      {!player.eliminated && (
        <div className="border-t border-gray-800 pt-2">
          {!pixel ? (
            <button onClick={connect} className="w-full rounded-lg bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700">
              Connect Die
            </button>
          ) : (
            <div className="flex items-center justify-between">
              <span className={`text-xs ${isConnected ? "text-green-400" : "text-gray-500"}`}>
                {isConnected ? `✓ ${dieName}` : (connStatus ?? "—")}
              </span>
              <button onClick={disconnect} disabled={isBusy} className="text-xs text-gray-600 hover:text-gray-400 disabled:opacity-40">
                ×
              </button>
            </div>
          )}
          {(reqErr ?? connErr) && <p className="mt-1 text-xs text-red-400">{(reqErr ?? connErr)!.message}</p>}
        </div>
      )}
    </div>
  );
}

// ── Main game component ───────────────────────────────────────────────────────

const INITIAL_PLAYERS = [0, 1, 2, 3].map(makePlayer);

function HammerGame() {
  const [state, setState] = useState<GameState>({
    playerCount: 2,
    phase: "setup",
    players: INITIAL_PLAYERS,
    logs: [],
  });
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (state.phase !== "playing") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== "playing") return;
    const id = setInterval(() => {
      setState(prev => {
        if (prev.phase !== "playing") return prev;
        const players = spawnModifiers(prev.players, prev.playerCount);
        return { ...prev, players, logs: ["✨ New modifiers spawned!", ...prev.logs].slice(0, 50) };
      });
    }, SPAWN_INTERVAL_MS);
    return () => clearInterval(id);
  }, [state.phase]);

  function handleRoll(playerId: number, face: number, dieFaceCount: number) {
    setState(prev => {
      if (prev.phase !== "playing") return prev;
      const { players, logs: newLogs } = processRoll(prev.players, playerId, face, dieFaceCount, Date.now());
      const logs = [...newLogs, ...prev.logs].slice(0, 50);
      const alive = players.filter((p, i) => i < prev.playerCount && !p.eliminated);
      const phase: GamePhase = alive.length <= 1 ? "gameover" : "playing";
      return { ...prev, players, logs, phase };
    });
  }

  function startGame() {
    setState(prev => {
      const players = spawnModifiers(prev.players, prev.playerCount);
      return { ...prev, phase: "playing", players, logs: ["⚔️ The battle begins!"] };
    });
  }

  function resetGame() {
    setState({ playerCount: state.playerCount, phase: "setup", players: INITIAL_PLAYERS, logs: [] });
  }

  const activePlayers = state.players.slice(0, state.playerCount);
  const winner = state.phase === "gameover" ? activePlayers.find(p => !p.eliminated) : undefined;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-5xl px-4 py-10 space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <Link to="/" className="text-sm text-gray-500 hover:text-gray-300">← Back</Link>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">Hammer of Wilderwood</h1>
          </div>
          {state.phase !== "setup" && (
            <button onClick={resetGame} className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:bg-gray-800">
              New Game
            </button>
          )}
        </div>

        {/* Player count (setup only) */}
        {state.phase === "setup" && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">Players:</span>
            {[2, 3, 4].map(n => (
              <button
                key={n}
                onClick={() => setState(prev => ({ ...prev, playerCount: n }))}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                  state.playerCount === n ? "bg-white text-gray-900" : "border border-gray-700 text-gray-400 hover:bg-gray-800"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        )}

        {/* Winner banner */}
        {winner && (
          <div className="rounded-2xl border border-yellow-500 bg-yellow-950/40 p-6 text-center">
            <p className="text-3xl font-bold text-yellow-400">🏆 {winner.name} wins!</p>
            <p className="mt-1 text-sm text-gray-400">The last warrior standing in Wilderwood</p>
          </div>
        )}

        {/* Player slots — always mounted to preserve Bluetooth connections */}
        <div className="flex flex-wrap gap-4">
          {activePlayers.map((player, i) => (
            <PlayerSlot
              key={player.id}
              slotIndex={i}
              player={player}
              phase={state.phase}
              now={now}
              onNameChange={name => setState(prev => ({
                ...prev,
                players: prev.players.map((p, pi) => pi === i ? { ...p, name } : p),
              }))}
              onRoll={(face, faceCount) => handleRoll(player.id, face, faceCount)}
            />
          ))}
        </div>

        {/* Start button (setup) */}
        {state.phase === "setup" && (
          <button
            onClick={startGame}
            disabled={activePlayers.some(p => !p.name.trim())}
            className="rounded-xl bg-white px-8 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-100 disabled:opacity-40"
          >
            Start Battle
          </button>
        )}

        {/* Battle log */}
        {state.phase !== "setup" && state.logs.length > 0 && (
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-600">Battle Log</p>
            <div className="max-h-52 space-y-1 overflow-y-auto">
              {state.logs.map((line, i) => (
                <p key={i} className={`text-sm ${i === 0 ? "text-white" : "text-gray-500"}`}>{line}</p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Route ─────────────────────────────────────────────────────────────────────

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Hammer of Wilderwood" },
    { name: "description", content: "Battle with Pixel dice in Hammer of Wilderwood" },
  ];
}

export default function HammerOfWilderwood() {
  return <HammerGame />;
}
