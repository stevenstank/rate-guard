import { app } from "./app.js";
import { error as logError, info } from "./utils/logger.js";

const DEFAULT_PORT = 3000;

const resolvePort = (value: string | undefined): number => {
  if (!value) {
    return DEFAULT_PORT;
  }

  const parsedPort = Number(value);
  const isValidPort =
    Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65_535;

  return isValidPort ? parsedPort : DEFAULT_PORT;
};

const port = resolvePort(process.env.PORT);

const server = app.listen(port, () => {
  info(`Server running on port ${port}`);
});

server.on("error", (serverError: Error) => {
  logError(`Server failed to start: ${serverError.message}`);
});
