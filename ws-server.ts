import { WebSocketServer, WebSocket } from "ws";
import { fileURLToPath } from "url";
import {
  makePlayer,
  processRoll,
  spawnModifiers,
  SPAWN_INTERVAL_MS,
  type GamePlayer,
  type GamePhase,
  type RoomState,
} from "./server/game-logic.js";
import type { ClientMessage, ServerMessage } from "./server/protocol.js";

interface RoomEntry {
  state: RoomState;
  connections: Map<number, WebSocket>;
  spawnTimer: ReturnType<typeof setInterval> | null;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}

const rooms = new Map<string, RoomEntry>();
let nextPlayerId = 1;

function generateRoomKey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let key: string;
  do {
    key = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (rooms.has(key));
  return key;
}

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room: RoomEntry, msg: ServerMessage) {
  for (const ws of room.connections.values()) send(ws, msg);
}

function broadcastState(room: RoomEntry) {
  broadcast(room, { type: "state_update", room: room.state });
}

function stopSpawnTimer(room: RoomEntry) {
  if (room.spawnTimer) { clearInterval(room.spawnTimer); room.spawnTimer = null; }
}

function startSpawnTimer(roomKey: string) {
  const room = rooms.get(roomKey);
  if (!room) return;
  stopSpawnTimer(room);
  room.spawnTimer = setInterval(() => {
    const r = rooms.get(roomKey);
    if (!r || r.state.phase !== "playing") return;
    const players = spawnModifiers(r.state.players, r.state.playerCount);
    r.state = { ...r.state, players, logs: ["✨ New modifiers spawned!", ...r.state.logs].slice(0, 50) };
    broadcastState(r);
  }, SPAWN_INTERVAL_MS);
}

function checkGameOver(room: RoomEntry): boolean {
  const alive = room.state.players.filter((p, i) => i < room.state.playerCount && !p.eliminated);
  if (alive.length <= 1) {
    room.state = { ...room.state, phase: "gameover" };
    stopSpawnTimer(room);
    return true;
  }
  return false;
}

export function setupWss(wss: WebSocketServer) {
wss.on("connection", (ws) => {
  let myRoomKey: string | null = null;
  let myPlayerId: number | null = null;

  ws.on("message", (raw) => {
    let msg: ClientMessage;
    try { msg = JSON.parse(raw.toString()) as ClientMessage; }
    catch { return; }

    if (msg.type === "create_room") {
      const roomKey = generateRoomKey();
      const playerId = nextPlayerId++;
      myRoomKey = roomKey;
      myPlayerId = playerId;

      const player = makePlayer(0, msg.playerName);
      player.id = playerId;

      const state: RoomState = {
        roomKey,
        hostId: playerId,
        playerCount: 0,
        phase: "lobby-waiting",
        players: [player],
        logs: [],
      };
      const room: RoomEntry = { state, connections: new Map([[playerId, ws]]), spawnTimer: null, cleanupTimer: null };
      rooms.set(roomKey, room);

      send(ws, { type: "joined", roomKey, playerId });
      broadcastState(room);
      return;
    }

    if (msg.type === "join_room") {
      const room = rooms.get(msg.roomKey.toUpperCase());
      if (!room) { send(ws, { type: "error", message: "Room not found" }); return; }
      if (room.state.phase !== "lobby-waiting") { send(ws, { type: "error", message: "Game already in progress" }); return; }
      if (room.state.players.length >= 4) { send(ws, { type: "error", message: "Room is full" }); return; }

      const playerId = nextPlayerId++;
      myRoomKey = msg.roomKey.toUpperCase();
      myPlayerId = playerId;

      const slotIndex = room.state.players.length;
      const player = makePlayer(slotIndex, msg.playerName);
      player.id = playerId;

      room.state = { ...room.state, players: [...room.state.players, player] };
      room.connections.set(playerId, ws);

      if (room.cleanupTimer) { clearTimeout(room.cleanupTimer); room.cleanupTimer = null; }

      send(ws, { type: "joined", roomKey: myRoomKey, playerId });
      broadcastState(room);
      return;
    }

    // All other messages require an established room
    if (!myRoomKey || myPlayerId === null) return;
    const room = rooms.get(myRoomKey);
    if (!room) return;

    if (msg.type === "start_game") {
      if (myPlayerId !== room.state.hostId) return;
      if (room.state.players.length < 2) { send(ws, { type: "error", message: "Need at least 2 players" }); return; }
      if (room.state.players.some(p => !p.dieConnected)) { send(ws, { type: "error", message: "All players must connect their dice" }); return; }
      const playerCount = room.state.players.length;
      const players = spawnModifiers(room.state.players, playerCount);
      room.state = { ...room.state, phase: "playing", playerCount, players, logs: ["⚔️ The battle begins!"] };
      broadcastState(room);
      startSpawnTimer(myRoomKey);
      return;
    }

    if (msg.type === "reset_game") {
      if (myPlayerId !== room.state.hostId) return;
      stopSpawnTimer(room);
      const players = room.state.players.map((p, i) => {
        const fresh = makePlayer(i, p.name);
        fresh.id = p.id;
        fresh.dieConnected = p.dieConnected;
        fresh.dieName = p.dieName;
        return fresh;
      });
      room.state = { ...room.state, phase: "lobby-waiting", playerCount: 0, players, logs: [] };
      broadcastState(room);
      return;
    }

    if (msg.type === "roll") {
      if (room.state.phase !== "playing") return;
      const { players, logs: newLogs } = processRoll(room.state.players, myPlayerId, msg.face, msg.dieFaceCount, Date.now());
      const logs = [...newLogs, ...room.state.logs].slice(0, 50);
      room.state = { ...room.state, players, logs };
      checkGameOver(room);
      broadcastState(room);
      return;
    }

    if (msg.type === "die_status") {
      const players = room.state.players.map(p =>
        p.id === myPlayerId
          ? { ...p, dieConnected: msg.connected, dieName: msg.dieName ?? p.dieName }
          : p
      );
      room.state = { ...room.state, players };
      broadcastState(room);
      return;
    }
  });

  ws.on("close", () => {
    if (!myRoomKey || myPlayerId === null) return;
    const room = rooms.get(myRoomKey);
    if (!room) return;
    room.connections.delete(myPlayerId);

    if (room.connections.size === 0) {
      stopSpawnTimer(room);
      room.cleanupTimer = setTimeout(() => {
        if (rooms.get(myRoomKey!)?.connections.size === 0) rooms.delete(myRoomKey!);
      }, 60_000);
    } else if (myPlayerId === room.state.hostId) {
      // Transfer host to first remaining connection
      const newHostId = room.connections.keys().next().value!;
      room.state = { ...room.state, hostId: newHostId };
      broadcastState(room);
    }
  });
}); // wss.on("connection")
} // setupWss

// Standalone dev mode — only runs when invoked directly via `tsx watch ws-server.ts`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const PORT = Number(process.env.WS_PORT ?? 3001);
  const wss = new WebSocketServer({ port: PORT });
  setupWss(wss);
  console.log(`WS server listening on ws://localhost:${PORT}`);
}
