"use client";

import { useState, useEffect, useRef } from "react";
import type { GamePlayer, GamePhase, GameSettings } from "../../../server/game-logic";
import { makePlayer, processRoll, spawnModifiers, DEFAULT_SETTINGS } from "../../../server/game-logic";
import type { ClientMessage } from "../../../server/protocol";
import { CPU_DIE_FACES, HUMAN_ID, CPU_ID } from "./constants";
import { TreeBackground } from "./TreeBackground";
import { PlayerSlot } from "./PlayerSlot";

function makeSoloPlayers(): GamePlayer[] {
  return [
    { ...makePlayer(0, "You"), id: HUMAN_ID },
    { ...makePlayer(1, "CPU"), id: CPU_ID, dieConnected: true, dieName: "d20" },
  ];
}

export function SoloGame({ onBack }: { onBack: () => void }) {
  const [players, setPlayers] = useState<GamePlayer[]>(makeSoloPlayers);
  const [phase, setPhase] = useState<GamePhase>("lobby-waiting");
  const [logs, setLogs] = useState<string[]>([]);
  const [settings] = useState<GameSettings>({ ...DEFAULT_SETTINGS });
  const [now, setNow] = useState(Date.now());

  const playersRef = useRef(players);
  playersRef.current = players;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    if (phase !== "playing") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "playing") return;
    const id = setInterval(() => {
      setPlayers(ps => spawnModifiers(ps, 2));
      setLogs(prev => ["✨ New modifiers spawned!", ...prev].slice(0, 50));
    }, settings.spawnIntervalSecs * 1000);
    return () => clearInterval(id);
  }, [phase, settings.spawnIntervalSecs]);

  function applyRoll(rollerId: number, face: number, faceCount: number): boolean {
    const { players: next, logs: newLogs } = processRoll(playersRef.current, rollerId, face, faceCount, Date.now(), settings);
    playersRef.current = next;
    setPlayers(next);
    setLogs(prev => [...newLogs, ...prev].slice(0, 50));
    const over = next.filter(p => !p.eliminated).length <= 1;
    if (over) setPhase("gameover");
    return over;
  }

  function handleSendMsg(msg: ClientMessage) {
    if (msg.type === "die_status") {
      setPlayers(ps => ps.map(p => p.id === HUMAN_ID ? { ...p, dieConnected: msg.connected, dieName: msg.dieName ?? p.dieName } : p));
      return;
    }
    if (msg.type === "set_class") {
      setPlayers(ps => ps.map(p => p.id === HUMAN_ID ? { ...p, playerClass: msg.playerClass } : p));
      return;
    }
    if (msg.type === "roll") {
      const over = applyRoll(HUMAN_ID, msg.face, msg.dieFaceCount);
      if (!over) setTimeout(() => {
        if (phaseRef.current !== "playing") return;
        applyRoll(CPU_ID, 1 + Math.floor(Math.random() * CPU_DIE_FACES), CPU_DIE_FACES);
      }, 900);
    }
  }

  function startGame() {
    setPlayers(spawnModifiers(players.map(p => ({ ...p, hp: settings.maxHp })), 2));
    setLogs(["⚔️ The battle begins!"]);
    setPhase("playing");
  }

  function resetGame() {
    setPlayers(makeSoloPlayers());
    setLogs([]);
    setPhase("lobby-waiting");
  }

  const human = players.find(p => p.id === HUMAN_ID)!;
  const winner = phase === "gameover" ? players.find(p => !p.eliminated) : undefined;

  const slots = players.map((player, i) => (
    <PlayerSlot key={player.id} slotIndex={i} player={player} isMe={player.id === HUMAN_ID}
      phase={phase} now={now} sendMsg={handleSendMsg}
      onSetClass={player.id === CPU_ID && phase === "lobby-waiting"
        ? (c) => setPlayers(ps => ps.map(p => p.id === CPU_ID ? { ...p, playerClass: c } : p))
        : undefined}
    />
  ));

  return (
    <div className="relative min-h-screen overflow-hidden bg-gray-950 text-white">
      <TreeBackground />
      <div className="relative mx-auto max-w-3xl px-4 py-10 space-y-8">
        <div className="flex items-start justify-between">
          <div>
            <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-300">← Back</button>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">Hammer of Wilderwood</h1>
            <p className="mt-0.5 text-sm text-gray-500">Solo</p>
          </div>
          {phase !== "lobby-waiting" && (
            <button onClick={resetGame} className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:bg-gray-800">
              New Game
            </button>
          )}
        </div>

        {winner && (
          <div className="rounded-2xl border border-yellow-500 bg-yellow-950/40 p-6 text-center">
            <p className="text-3xl font-bold text-yellow-400">
              {winner.id === HUMAN_ID ? "🏆 You win!" : "💀 CPU wins!"}
            </p>
            <p className="mt-1 text-sm text-gray-400">The last warrior standing in Wilderwood</p>
          </div>
        )}

        <div className="flex flex-wrap gap-4">{slots}</div>

        {phase === "lobby-waiting" && (
          <div className="space-y-2">
            {!human.dieConnected && <p className="text-sm text-gray-500">Connect your die to start…</p>}
            <button disabled={!human.dieConnected} onClick={startGame}
              className="rounded-xl bg-white px-8 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-100 disabled:opacity-40">
              Start Battle
            </button>
          </div>
        )}

        {logs.length > 0 && (
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-600">Battle Log</p>
            <div className="max-h-52 space-y-1 overflow-y-auto">
              {logs.map((line, i) => (
                <p key={i} className={`text-sm ${i === 0 ? "text-white" : "text-gray-500"}`}>{line}</p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
