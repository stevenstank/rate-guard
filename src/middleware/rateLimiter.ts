import type { NextFunction, Request, Response } from "express";

import { info } from "../utils/logger.js";

export const rateLimiterMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  console.log("MIDDLEWARE TRIGGERED");
  const ipAddress = req.ip || req.socket.remoteAddress || "unknown";
  const method = req.method;
  const path = req.path;

  info(`IP: ${ipAddress} | METHOD: ${method} | PATH: ${path}`);

  next();
};
