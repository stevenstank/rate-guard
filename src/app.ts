import express, { type Express, type Request, type Response } from "express";
import { rateLimiterMiddleware } from "./middleware/rateLimiter.js";

export const app: Express = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(rateLimiterMiddleware);

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});
