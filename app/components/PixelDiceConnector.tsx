"use client";

import { useState, useEffect } from "react";
import { requestPixel } from "@systemic-games/pixels-web-connect";
import {
  usePixelConnect,
  usePixelEvent,
} from "@systemic-games/pixels-react";
import type { Pixel } from "@systemic-games/pixels-web-connect";

const STATUS_LABEL: Record<string, string> = {
  disconnected: "Disconnected",
  connecting: "Connecting...",
  identifying: "Identifying...",
  ready: "Connected",
  disconnecting: "Disconnecting...",
};

interface Props {
  label?: string;
  onRoll?: (roll: { face: number; dieFaceCount: number }) => void;
  onRemove?: () => void;
}

export function PixelDiceConnector({ label = "Pixel Dice", onRoll, onRemove }: Props) {
  const [pixel, setPixel] = useState<Pixel | undefined>();
  const [requestError, setRequestError] = useState<Error | undefined>();

  const [status, curPixel, dispatch, connectError] = usePixelConnect(pixel);
  const [rollFace] = usePixelEvent(pixel, "rollFace");

  useEffect(() => {
    if (rollFace && curPixel) {
      onRoll?.({ face: rollFace.face, dieFaceCount: curPixel.dieFaceCount });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollFace]);

  const isReady = status === "ready";
  const isBusy =
    status === "connecting" ||
    status === "identifying" ||
    status === "disconnecting";

  async function handleConnect() {
    setRequestError(undefined);
    try {
      const p = await requestPixel();
      setPixel(p);
    } catch (err) {
      setRequestError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  function handleReconnect() {
    dispatch("connect");
  }

  function handleDisconnect() {
    dispatch("disconnect");
    setPixel(undefined);
  }

  const error = requestError ?? connectError;
  const statusLabel = status ? STATUS_LABEL[status] ?? status : "Disconnected";
  const displayLabel = (curPixel?.name || "") || label;

  return (
    <div className="relative flex flex-col items-center gap-6 rounded-3xl border border-gray-200 p-8 dark:border-gray-700">
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label="Remove die"
          className="absolute right-4 top-4 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
        >
          ×
        </button>
      )}
      <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
        {displayLabel}
      </h2>

      <div
        className="flex h-32 w-32 items-center justify-center rounded-2xl border-4 border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-800"
        aria-label={rollFace ? `Rolled ${rollFace.face}` : "No roll yet"}
      >
        {rollFace ? (
          <span className="text-6xl font-bold text-gray-900 dark:text-white">
            {rollFace.face}
          </span>
        ) : (
          <span className="text-4xl text-gray-400 dark:text-gray-500">?</span>
        )}
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400">
        {statusLabel}
      </p>

      {!pixel ? (
        <button
          onClick={handleConnect}
          className="rounded-xl bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800"
        >
          Connect Die
        </button>
      ) : status === "disconnected" ? (
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={handleReconnect}
            className="rounded-xl bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800"
          >
            Reconnect
          </button>
          <button
            onClick={handleDisconnect}
            className="text-xs text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
          >
            Forget die
          </button>
        </div>
      ) : (
        <button
          onClick={handleDisconnect}
          disabled={isBusy}
          className="rounded-xl border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 active:bg-gray-200 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Disconnect
        </button>
      )}

      {error && (
        <p className="text-sm text-red-500 dark:text-red-400">
          {error.message}
        </p>
      )}

      {isReady && !rollFace && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Roll your die to see the result
        </p>
      )}
    </div>
  );
}
