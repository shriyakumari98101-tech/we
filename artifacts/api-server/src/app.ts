import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const BOT_ORIGIN = "http://localhost:3000";

async function botProxy(req: Request, res: Response, targetPath: string) {
  try {
    const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    const url = `${BOT_ORIGIN}${targetPath}${qs}`;
    const headers: Record<string, string> = {};
    if (req.headers.cookie) headers["cookie"] = req.headers.cookie;
    if (req.headers["content-type"])
      headers["content-type"] = req.headers["content-type"] as string;

    const hasBody =
      req.method !== "GET" &&
      req.method !== "HEAD" &&
      req.body &&
      Object.keys(req.body).length > 0;

    const response = await fetch(url, {
      method: req.method,
      headers,
      body: hasBody ? JSON.stringify(req.body) : undefined,
    });

    const setCookie = response.headers.get("set-cookie");
    if (setCookie) res.setHeader("Set-Cookie", setCookie);
    const contentType = response.headers.get("content-type");
    if (contentType) res.setHeader("Content-Type", contentType);

    const buffer = Buffer.from(await response.arrayBuffer());
    res.status(response.status).send(buffer);
  } catch {
    res.status(502).json({ error: "Bot service temporarily unavailable" });
  }
}

app.get("/panel", (req, res) => botProxy(req, res, "/panel"));
app.get("/login", (req, res) => botProxy(req, res, "/login"));
app.get("/health", (req, res) => botProxy(req, res, "/health"));

app.all("/api/auth/login", (req, res) => botProxy(req, res, "/api/auth/login"));
app.all("/api/auth/logout", (req, res) => botProxy(req, res, "/api/auth/logout"));
app.get("/api/me", (req, res) => botProxy(req, res, "/api/me"));
app.get("/api/appeals", (req, res) => botProxy(req, res, "/api/appeals"));
app.get("/api/logs", (req, res) => botProxy(req, res, "/api/logs"));
app.get("/api/settings", (req, res) => botProxy(req, res, "/api/settings"));
app.post("/api/settings", (req, res) => botProxy(req, res, "/api/settings"));
app.post("/api/shift", (req, res) => botProxy(req, res, "/api/shift"));
app.get("/api/commands", (req, res) => botProxy(req, res, "/api/commands"));

app.use("/api", router);

export default app;
