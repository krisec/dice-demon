import type { RoomState, PlayerClass } from "./game-logic.js";

// Client → Server messages
export type ClientMessage =
  | { type: "create_room"; playerName: string }
  | { type: "join_room"; roomKey: string; playerName: string }
  | { type: "start_game" }
  | { type: "reset_game" }
  | { type: "roll"; face: number; dieFaceCount: number }
  | { type: "die_status"; connected: boolean; dieName?: string }
  | { type: "set_class"; playerClass: PlayerClass };

// Server → Client messages
export type ServerMessage =
  | { type: "joined"; roomKey: string; playerId: number }
  | { type: "state_update"; room: RoomState }
  | { type: "error"; message: string };

export type { RoomState };
