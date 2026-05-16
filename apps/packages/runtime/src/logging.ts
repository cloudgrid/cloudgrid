import type { CloudGridErrorId } from "./problem";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  request_id?: string;
  trace_id?: string;
  span_id?: string;
  error_id?: CloudGridErrorId;
  error_code?: string;
  message?: string;
  [key: string]: unknown;
}

export interface CloudGridLogger {
  debug: (event: string, fields?: LogFields) => void;
  info: (event: string, fields?: LogFields) => void;
  warn: (event: string, fields?: LogFields) => void;
  error: (event: string, fields?: LogFields) => void;
}

export interface LogSink {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}

export function createLogger(service: string, sink: LogSink = consoleSink): CloudGridLogger {
  const write = (level: LogLevel, event: string, fields: LogFields = {}) => {
    const record = {
      timestamp: new Date().toISOString(),
      level,
      service,
      event,
      request_id: fields.request_id ?? "",
      message: fields.message ?? event,
      ...fields,
    };
    const line = JSON.stringify(record);
    if (level === "error") {
      sink.stderr(line);
      return;
    }
    sink.stdout(line);
  };

  return {
    debug: (event, fields) => write("debug", event, fields),
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, fields) => write("error", event, fields),
  };
}

const consoleSink: LogSink = {
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line),
};
