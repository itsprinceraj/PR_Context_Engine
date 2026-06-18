const SECRET_KEY_PATTERN = /(token|auth|api[-_]?key|secret|password)/i;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[Truncated]";

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, depth + 1));
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        SECRET_KEY_PATTERN.test(key) ? "[Redacted]" : sanitize(nestedValue, depth + 1)
      ])
    );
  }

  if (typeof value === "string" && /(gh[pousr]_[A-Za-z0-9_]+|pcsk_[A-Za-z0-9_]+)/.test(value)) {
    return value.replace(/(gh[pousr]_[A-Za-z0-9_]+|pcsk_[A-Za-z0-9_]+)/g, "[Redacted]");
  }

  return value;
}

export const logger = {
  info: (message: string, ...args: any[]) => {
    console.error(`[INFO] ${message}`, ...args.map((arg) => sanitize(arg)));
  },
  warn: (message: string, ...args: any[]) => {
    console.error(`[WARN] ${message}`, ...args.map((arg) => sanitize(arg)));
  },
  error: (message: string, ...args: any[]) => {
    console.error(`[ERROR] ${message}`, ...args.map((arg) => sanitize(arg)));
  },
  debug: (message: string, ...args: any[]) => {
    console.error(`[DEBUG] ${message}`, ...args.map((arg) => sanitize(arg)));
  }
};
