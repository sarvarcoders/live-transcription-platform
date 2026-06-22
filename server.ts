import { createServer } from "node:http";
import { loadEnvConfig } from "@next/env";
import next from "next";
import { Server } from "socket.io";
import { registerSocketHandlers } from "./src/server/socket";
import { logEnvDiagnostics } from "./src/server/env";

loadEnvConfig(process.cwd());

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT || 3000);
const host = "0.0.0.0";

function getAllowedOrigins() {
  const configuredOrigins = process.env.NEXT_PUBLIC_APP_URL
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const localOrigins = [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
  return configuredOrigins?.length ? [...configuredOrigins, ...localOrigins] : localOrigins;
}

async function bootstrap() {
  logEnvDiagnostics("server startup");

  const app = next({ dev, hostname: host, port });
  const handle = app.getRequestHandler();

  await app.prepare();

  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  const io = new Server(httpServer, {
    cors: {
      origin: getAllowedOrigins(),
      methods: ["GET", "POST"]
    },
    transports: ["websocket", "polling"],
    perMessageDeflate: false,
    pingInterval: 25_000,
    pingTimeout: 30_000,
    connectTimeout: 45_000,
    maxHttpBufferSize: 1e7
  });

  registerSocketHandlers(io);

  httpServer.listen(port, host, () => {
    console.log(`> Ready on http://${host}:${port}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
