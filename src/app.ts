import express, { type Express, type Request, type Response } from "express";
import { createRateLimiter } from "./middleware/rateLimiter.js";
import {
  API_RATE_LIMIT_CONFIG,
  LOGIN_RATE_LIMIT_CONFIG,
} from "./config/rateLimit.js";

export const app: Express = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/login", createRateLimiter(LOGIN_RATE_LIMIT_CONFIG));
app.use("/api", createRateLimiter(API_RATE_LIMIT_CONFIG));

app.get("/health", (_req: Request, res: Response): void => {
  res.status(200).json({ status: "ok" });
});

app.post("/login", (_req: Request, res: Response): void => {
  res.status(200).json({ ok: true, route: "login" });
});

app.get("/api", (_req: Request, res: Response): void => {
  res.status(200).json({ ok: true, route: "api" });
});
