"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router";
import { requestPixel } from "@systemic-games/pixels-web-connect";
import { usePixelConnect, usePixelEvent } from "@systemic-games/pixels-react";
import type { Pixel } from "@systemic-games/pixels-web-connect";
import type { Route } from "./+types/hammer-of-wilderwood";
import type { RoomState, GamePlayer, GamePhase, ModifierType, PlayerClass, GameSettings } from "../../server/game-logic";
import { CLASS_INFO, DEFAULT_SETTINGS } from "../../server/game-logic";
import type { ClientMessage, ServerMessage } from "../../server/protocol";

// ── Constants (display-only, game logic lives on the server) ─────────────────

const MAX_HP = 250;

const PLAYER_COLORS = [
  { bg: "bg-rose-950/40",    border: "border-rose-500",    bar: "bg-rose-500",    text: "text-rose-400" },
  { bg: "bg-blue-950/40",    border: "border-blue-500",    bar: "bg-blue-500",    text: "text-blue-400" },
  { bg: "bg-emerald-950/40", border: "border-emerald-500", bar: "bg-emerald-500", text: "text-emerald-400" },
  { bg: "bg-amber-950/40",   border: "border-amber-500",   bar: "bg-amber-500",   text: "text-amber-400" },
];

const MODIFIER_INFO: Record<ModifierType, { name: string; emoji: string; cls: string }> = {
  frost:      { name: "Frost",      emoji: "❄️", cls: "bg-blue-500/20 text-blue-300 border-blue-400/40" },
  fire:       { name: "Fire",       emoji: "🔥", cls: "bg-orange-500/20 text-orange-300 border-orange-400/40" },
  poison:     { name: "Poison",     emoji: "☠️", cls: "bg-green-500/20 text-green-300 border-green-400/40" },
  shield:     { name: "Shield",     emoji: "🛡️", cls: "bg-gray-500/20 text-gray-300 border-gray-400/40" },
  earthquake: { name: "Earthquake", emoji: "⚡", cls: "bg-yellow-500/20 text-yellow-300 border-yellow-400/40" },
};

// ── Settings field config (for rendering the settings panel) ─────────────────

const SETTING_GROUPS: Array<{
  label: string;
  fields: Array<{ key: keyof GameSettings; label: string; min: number; max: number; step: number; suffix?: string }>;
}> = [
  { label: "General", fields: [
    { key: "maxHp",             label: "Max HP",               min: 50,  max: 500, step: 25 },
    { key: "spawnIntervalSecs", label: "Modifier spawn every", min: 5,   max: 120, step: 5, suffix: "s" },
  ]},
  { label: "🔥 Fire", fields: [
    { key: "fireDamage", label: "Damage per tick", min: 1, max: 50, step: 1 },
    { key: "fireRolls",  label: "Ticks",           min: 1, max: 10, step: 1 },
  ]},
  { label: "❄️ Frost", fields: [
    { key: "frostSecs", label: "Freeze duration", min: 1, max: 60, step: 1, suffix: "s" },
  ]},
  { label: "☠️ Poison", fields: [
    { key: "poisonRolls", label: "Ticks (−50% dmg)", min: 1, max: 10, step: 1 },
  ]},
  { label: "🛡️ Shield", fields: [
    { key: "shieldHp", label: "HP amount", min: 5, max: 200, step: 5 },
  ]},
  { label: "⚡ Earthquake", fields: [
    { key: "earthquakeMult", label: "Damage multiplier", min: 1, max: 10, step: 0.5, suffix: "×" },
  ]},
];

// ── WebSocket hook ────────────────────────────────────────────────────────────

function useGameSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [myId, setMyId] = useState<number | null>(null);
  const [wsError, setWsError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    if (wsRef.current) return;
    const url = import.meta.env.DEV
      ? "ws://localhost:3001"
      : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`;
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => { setConnected(true); setWsError(null); };
      ws.onclose = () => { setConnected(false); wsRef.current = null; };
      ws.onerror = () => setWsError("Could not connect to game server");

      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data as string) as ServerMessage;
        if (msg.type === "joined") setMyId(msg.playerId);
        if (msg.type === "state_update") setRoom(msg.room);
        if (msg.type === "error") setWsError(msg.message);
      };
    } catch (e) {
      setWsError(e instanceof Error ? e.message : "Could not connect to game server");
    }
  }, []);

  useEffect(() => { connect(); return () => { wsRef.current?.close(); }; }, [connect]);

  function sendMsg(msg: ClientMessage) {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg));
  }

  return { room, myId, wsError, connected, sendMsg };
}

// ── PlayerSlot ────────────────────────────────────────────────────────────────

interface SlotProps {
  slotIndex: number;
  player: GamePlayer;
  isMe: boolean;
  phase: GamePhase;
  now: number;
  sendMsg: (msg: ClientMessage) => void;
}

const LARGE_DAMAGE_THRESHOLD = 15;

function PlayerSlot({ slotIndex, player, isMe, phase, now, sendMsg }: SlotProps) {
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

  // Notify server when die connects/disconnects
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

  // ── Setup / lobby view ──
  if (phase === "lobby-waiting") {
    const cls = CLASS_INFO[player.playerClass];
    return (
      <div className={`rounded-2xl border ${colors.border} ${colors.bg} p-5 space-y-3 w-52`}>
        <p className={`text-xs font-semibold uppercase tracking-widest ${colors.text}`}>{player.name}</p>

        {/* Class selection */}
        {isMe ? (
          <div className="space-y-1.5">
            <p className="text-xs text-gray-500">Class</p>
            <div className="flex gap-1">
              {(Object.keys(CLASS_INFO) as PlayerClass[]).map(c => {
                const ci = CLASS_INFO[c];
                return (
                  <button
                    key={c}
                    title={ci.desc}
                    onClick={() => sendMsg({ type: "set_class", playerClass: c })}
                    className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors ${
                      player.playerClass === c
                        ? `${colors.border} ${colors.bg} ${colors.text}`
                        : "border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {ci.emoji}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-500">{cls.emoji} {cls.name} — {cls.desc}</p>
          </div>
        ) : (
          <p className="text-xs text-gray-400">{cls.emoji} {cls.name}</p>
        )}

        {/* Die connection */}
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
              <button onClick={disconnect} disabled={isBusy} className="w-full rounded-lg border border-gray-700 px-3 py-1 text-xs text-gray-500 hover:bg-gray-800 disabled:opacity-40">
                Disconnect
              </button>
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

// ── Main game component ───────────────────────────────────────────────────────

function HammerGame() {
  const { room, myId, wsError, connected, sendMsg } = useGameSocket();
  const [now, setNow] = useState(Date.now());
  const [lobbyName, setLobbyName] = useState("");
  const [joinKey, setJoinKey] = useState("");
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Tick for freeze countdowns
  useEffect(() => {
    if (room?.phase !== "playing") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [room?.phase]);

  // Show server errors briefly
  useEffect(() => {
    if (!wsError) return;
    setLobbyError(wsError);
  }, [wsError]);

  const phase = room?.phase ?? "lobby-entry";
  const myPlayer = room?.players.find(p => p.id === myId);
  const mySlotIndex = room?.players.findIndex(p => p.id === myId) ?? -1;
  const isHost = room?.hostId === myId;
  const activePlayers = room?.players ?? [];
  const allDiceConnected = activePlayers.length >= 2 && activePlayers.every(p => p.dieConnected);
  const winner = phase === "gameover" ? activePlayers.find(p => !p.eliminated) : undefined;

  // PlayerSlots must stay mounted to preserve Bluetooth across phase transitions
  const slots = room?.players.map((player, i) => (
    <PlayerSlot
      key={player.id}
      slotIndex={i}
      player={player}
      isMe={player.id === myId}
      phase={phase}
      now={now}
      sendMsg={sendMsg}
    />
  ));

  // ── Lobby entry ──
  if (phase === "lobby-entry") {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="w-full max-w-sm space-y-8 px-4">
          <div>
            <Link to="/" className="text-sm text-gray-500 hover:text-gray-300">← Back</Link>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Hammer of Wilderwood</h1>
            <p className="mt-1 text-sm text-gray-500">Multiplayer dice battle</p>
          </div>

          {!connected && (
            <div className="rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-400">
              {wsError ?? "Connecting to server…"}
            </div>
          )}

          <div className="space-y-3">
            <input
              type="text"
              value={lobbyName}
              onChange={e => setLobbyName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-xl border border-gray-600 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-gray-400 focus:outline-none"
            />

            <button
              disabled={!connected || !lobbyName.trim()}
              onClick={() => { setLobbyError(null); sendMsg({ type: "create_room", playerName: lobbyName.trim() }); }}
              className="w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-100 disabled:opacity-40"
            >
              Create Room
            </button>

            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-gray-700" />
              <span className="text-xs text-gray-600">or join existing</span>
              <div className="h-px flex-1 bg-gray-700" />
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={joinKey}
                onChange={e => setJoinKey(e.target.value.toUpperCase())}
                placeholder="Room key"
                maxLength={4}
                className="flex-1 rounded-xl border border-gray-600 bg-gray-800 px-4 py-2.5 text-sm font-mono tracking-widest text-white placeholder-gray-500 focus:border-gray-400 focus:outline-none"
              />
              <button
                disabled={!connected || !lobbyName.trim() || joinKey.length < 4}
                onClick={() => { setLobbyError(null); sendMsg({ type: "join_room", roomKey: joinKey, playerName: lobbyName.trim() }); }}
                className="rounded-xl border border-gray-600 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 disabled:opacity-40"
              >
                Join
              </button>
            </div>

            {lobbyError && <p className="text-sm text-red-400">{lobbyError}</p>}
          </div>
        </div>
      </div>
    );
  }

  // ── Lobby waiting ──
  if (phase === "lobby-waiting") {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <div className="mx-auto max-w-3xl px-4 py-10 space-y-8">
          <div>
            <Link to="/" className="text-sm text-gray-500 hover:text-gray-300">← Back</Link>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">Hammer of Wilderwood</h1>
          </div>

          {/* Room key */}
          <div className="rounded-2xl border border-gray-700 bg-gray-900 p-6 text-center space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Room Key</p>
            <p className="text-5xl font-bold tracking-widest font-mono">{room!.roomKey}</p>
            <p className="text-sm text-gray-500">Share this with other players</p>
          </div>

          {/* Player list */}
          <div className="flex flex-wrap gap-4">
            {slots}
          </div>

          {/* Settings panel */}
          <div className="rounded-2xl border border-gray-700 bg-gray-900">
            <button
              onClick={() => setSettingsOpen(o => !o)}
              className="flex w-full items-center justify-between px-5 py-3 text-sm text-gray-400 hover:text-white"
            >
              <span className="font-medium">⚙ Game Settings</span>
              <span>{settingsOpen ? "▲" : "▼"}</span>
            </button>
            {settingsOpen && (
              <div className="border-t border-gray-800 px-5 py-4 space-y-5">
                {SETTING_GROUPS.map(group => (
                  <div key={group.label}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">{group.label}</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                      {group.fields.map(field => {
                        const current = room!.settings[field.key] as number;
                        const isDefault = current === (DEFAULT_SETTINGS[field.key] as number);
                        return (
                          <label key={field.key} className="flex items-center justify-between gap-3">
                            <span className={`text-sm ${isDefault ? "text-gray-400" : "text-white"}`}>
                              {field.label}
                            </span>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                defaultValue={current}
                                min={field.min}
                                max={field.max}
                                step={field.step}
                                disabled={!isHost}
                                onChange={e => {
                                  const v = Number(e.target.value);
                                  if (!isNaN(v) && v >= field.min && v <= field.max)
                                    sendMsg({ type: "update_settings", settings: { [field.key]: v } });
                                }}
                                className="w-20 rounded-lg border border-gray-600 bg-gray-800 px-2 py-1 text-right text-sm text-white focus:border-gray-400 focus:outline-none disabled:opacity-50"
                              />
                              {field.suffix && <span className="text-xs text-gray-500">{field.suffix}</span>}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {!isHost && <p className="text-xs text-gray-600">Only the host can change settings.</p>}
              </div>
            )}
          </div>

          <div className="space-y-2">
            {isHost && activePlayers.length < 2 && (
              <p className="text-sm text-gray-500">Waiting for at least 1 more player…</p>
            )}
            {isHost && activePlayers.length >= 2 && !allDiceConnected && (
              <p className="text-sm text-gray-500">Waiting for all players to connect their dice…</p>
            )}
            {isHost && (
              <button
                disabled={!allDiceConnected}
                onClick={() => sendMsg({ type: "start_game" })}
                className="rounded-xl bg-white px-8 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-100 disabled:opacity-40"
              >
                Start Battle ({activePlayers.length} players)
              </button>
            )}
            {!isHost && (
              <p className="text-sm text-gray-500">Waiting for the host to start the game…</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Playing / gameover ──
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-5xl px-4 py-10 space-y-8">

        <div className="flex items-start justify-between">
          <div>
            <Link to="/" className="text-sm text-gray-500 hover:text-gray-300">← Back</Link>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">Hammer of Wilderwood</h1>
          </div>
          {isHost && (
            <button
              onClick={() => sendMsg({ type: "reset_game" })}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:bg-gray-800"
            >
              New Game
            </button>
          )}
        </div>

        {winner && (
          <div className="rounded-2xl border border-yellow-500 bg-yellow-950/40 p-6 text-center">
            <p className="text-3xl font-bold text-yellow-400">🏆 {winner.name} wins!</p>
            <p className="mt-1 text-sm text-gray-400">The last warrior standing in Wilderwood</p>
          </div>
        )}

        <div className="flex flex-wrap gap-4">
          {slots}
        </div>

        {room && room.logs.length > 0 && (
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-600">Battle Log</p>
            <div className="max-h-52 space-y-1 overflow-y-auto">
              {room.logs.map((line, i) => (
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
