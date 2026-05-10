"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { RoomState } from "../../../server/game-logic";
import type { ClientMessage, ServerMessage } from "../../../server/protocol";

export function useGameSocket() {
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
