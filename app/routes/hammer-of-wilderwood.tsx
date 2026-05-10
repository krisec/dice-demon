"use client";

import { useState, useEffect } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/hammer-of-wilderwood";
import { DEFAULT_SETTINGS } from "../../server/game-logic";
import { SETTING_GROUPS } from "../components/hammer/constants";
import { TreeBackground } from "../components/hammer/TreeBackground";
import { useGameSocket } from "../components/hammer/useGameSocket";
import { PlayerSlot } from "../components/hammer/PlayerSlot";
import { SoloGame } from "../components/hammer/SoloGame";

function HammerGame() {
  const [soloMode, setSoloMode] = useState(false);
  const { room, myId, wsError, connected, sendMsg } = useGameSocket();
  const [now, setNow] = useState(Date.now());
  const [lobbyName, setLobbyName] = useState("");
  const [joinKey, setJoinKey] = useState("");
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (room?.phase !== "playing") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [room?.phase]);

  useEffect(() => {
    if (!wsError) return;
    setLobbyError(wsError);
  }, [wsError]);

  if (soloMode) return <SoloGame onBack={() => setSoloMode(false)} />;

  const phase = room?.phase ?? "lobby-entry";
  const isHost = room?.hostId === myId;
  const activePlayers = room?.players ?? [];
  const allDiceConnected = activePlayers.length >= 2 && activePlayers.every(p => p.dieConnected);
  const winner = phase === "gameover" ? activePlayers.find(p => !p.eliminated) : undefined;

  const slots = room?.players.map((player, i) => (
    <PlayerSlot key={player.id} slotIndex={i} player={player} isMe={player.id === myId}
      phase={phase} now={now} sendMsg={sendMsg} />
  ));

  // ── Lobby entry ──
  if (phase === "lobby-entry") {
    return (
      <div className="relative min-h-screen overflow-hidden bg-gray-950 text-white flex items-center justify-center">
        <TreeBackground />
        <div className="relative w-full max-w-sm space-y-8 px-4">
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
              disabled={!lobbyName.trim()}
              onClick={() => setSoloMode(true)}
              className="w-full rounded-xl bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-40"
            >
              Solo Play
            </button>

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
      <div className="relative min-h-screen overflow-hidden bg-gray-950 text-white">
        <TreeBackground />
        <div className="relative mx-auto max-w-3xl px-4 py-10 space-y-8">
          <div>
            <Link to="/" className="text-sm text-gray-500 hover:text-gray-300">← Back</Link>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">Hammer of Wilderwood</h1>
          </div>

          <div className="rounded-2xl border border-gray-700 bg-gray-900 p-6 text-center space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Room Key</p>
            <p className="text-5xl font-bold tracking-widest font-mono">{room!.roomKey}</p>
            <p className="text-sm text-gray-500">Share this with other players</p>
          </div>

          <div className="flex flex-wrap gap-4">{slots}</div>

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
                                onBlur={e => {
                                  const raw = Number(e.target.value);
                                  const clamped = isNaN(raw)
                                    ? current
                                    : Math.min(field.max, Math.max(field.min, raw));
                                  e.target.value = String(clamped);
                                  sendMsg({ type: "update_settings", settings: { [field.key]: clamped } });
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
    <div className="relative min-h-screen overflow-hidden bg-gray-950 text-white">
      <TreeBackground />
      <div className="relative mx-auto max-w-5xl px-4 py-10 space-y-8">
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

        <div className="flex flex-wrap gap-4">{slots}</div>

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

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Hammer of Wilderwood" },
    { name: "description", content: "Battle with Pixel dice in Hammer of Wilderwood" },
  ];
}

export default function HammerOfWilderwood() {
  return <HammerGame />;
}
