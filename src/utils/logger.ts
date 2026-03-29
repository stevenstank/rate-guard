type LogLevel = "INFO" | "WARN" | "ERROR";

const formatLogMessage = (level: LogLevel, message: string): string => {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] ${level}: ${message}`;
};

export const info = (message: string): void => {
  console.info(formatLogMessage("INFO", message));
};

export const warn = (message: string): void => {
  console.warn(formatLogMessage("WARN", message));
};

export const error = (message: string): void => {
  console.error(formatLogMessage("ERROR", message));
};
