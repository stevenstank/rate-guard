type LogLevel = "INFO" | "WARN" | "ERROR";

export type LogContext = Record<string, unknown>;
export type LogInput = string | LogContext;

interface StructuredLogEntry extends LogContext {
  level: LogLevel;
  timestamp: string;
}

interface LoggerBackend {
  write: (level: LogLevel, entry: Readonly<StructuredLogEntry>) => void;
}

const consoleBackend: LoggerBackend = {
  write: (level: LogLevel, entry: Readonly<StructuredLogEntry>): void => {
    const payload = JSON.stringify(entry);
    if (level === "ERROR") {
      console.error(payload);
      return;
    }

    if (level === "WARN") {
      console.warn(payload);
      return;
    }

    console.info(payload);
  },
};

const buildLogEntry = (
  level: LogLevel,
  input: LogInput,
): StructuredLogEntry => {
  const baseEntry: StructuredLogEntry = {
    level,
    timestamp: new Date().toISOString(),
  };

  if (typeof input === "string") {
    return {
      ...baseEntry,
      message: input,
    };
  }

  return {
    ...baseEntry,
    ...input,
  };
};

const createLogger = (backend: LoggerBackend) => {
  const log = (level: LogLevel, input: LogInput): void => {
    const entry = buildLogEntry(level, input);
    backend.write(level, entry);
  };

  return {
    info: (input: LogInput): void => {
      log("INFO", input);
    },
    warn: (input: LogInput): void => {
      log("WARN", input);
    },
    error: (input: LogInput): void => {
      log("ERROR", input);
    },
  };
};

export const logger = createLogger(consoleBackend);
export const info = logger.info;
export const warn = logger.warn;
export const error = logger.error;
