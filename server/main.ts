import { createServer } from "http";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import express from "express";
import { createRequestListener } from "@react-router/node";
import { WebSocketServer } from "ws";
import { setupWss } from "../ws-server.js";

const PORT = Number(process.env.PORT ?? 3001);
const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDir = join(__dirname, "../../build/client");

const app = express();

// Static assets (JS/CSS bundles) — long cache since filenames are hashed
app.use(
  "/assets",
  express.static(join(clientDir, "assets"), { maxAge: "1y", immutable: true }),
);
// Other public files (favicon, etc.)
app.use(express.static(clientDir));

// React Router SSR
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const build = await import("../../build/server/index.js" as any);
const rrListener = createRequestListener({ build });
app.use((req, res) => rrListener(req, res));

const server = createServer(app);
const wss = new WebSocketServer({ server });
setupWss(wss);

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
