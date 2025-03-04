import { Attributes, Span, SpanOptions } from "@opentelemetry/api";
import { Logger, SeverityNumber } from "@opentelemetry/api-logs";
import { iconStringForSeverity } from "../icons.js";
import { SemanticInternalAttributes } from "../semanticInternalAttributes.js";
import { TriggerTracer } from "../tracer.js";
import { flattenAttributes } from "../utils/flattenAttributes.js";
import { ClockTime } from "../clock/clock.js";
import { clock } from "../clock-api.js";

export type LogLevel = "none" | "error" | "warn" | "info" | "debug" | "log";

export const logLevels: Array<LogLevel> = ["none", "error", "warn", "info", "debug"];

export type TaskLoggerConfig = {
  logger: Logger;
  tracer: TriggerTracer;
  level: LogLevel;
};

export interface TaskLogger {
  debug(message: string, properties?: Record<string, unknown>): void;
  log(message: string, properties?: Record<string, unknown>): void;
  info(message: string, properties?: Record<string, unknown>): void;
  warn(message: string, properties?: Record<string, unknown>): void;
  error(message: string, properties?: Record<string, unknown>): void;
  trace<T>(name: string, fn: (span: Span) => Promise<T>, options?: SpanOptions): Promise<T>;
  startSpan(name: string, options?: SpanOptions): Span;
}

export class OtelTaskLogger implements TaskLogger {
  private readonly _level: number;

  constructor(private readonly _config: TaskLoggerConfig) {
    this._level = logLevels.indexOf(_config.level);
  }

  debug(message: string, properties?: Record<string, unknown>) {
    if (this._level < 4) return; // ["none", "error", "warn", "info", "debug"];

    this.#emitLog(message, this.#getTimestampInHrTime(), "debug", SeverityNumber.DEBUG, properties);
  }

  log(message: string, properties?: Record<string, unknown>) {
    if (this._level < 3) return; // ["none", "error", "warn", "info", "debug"];

    this.#emitLog(message, this.#getTimestampInHrTime(), "log", SeverityNumber.INFO, properties);
  }

  info(message: string, properties?: Record<string, unknown>) {
    if (this._level < 3) return; // ["none", "error", "warn", "info", "debug"];

    this.#emitLog(message, this.#getTimestampInHrTime(), "info", SeverityNumber.INFO, properties);
  }

  warn(message: string, properties?: Record<string, unknown>) {
    if (this._level < 2) return; // ["none", "error", "warn", "info", "debug"];

    this.#emitLog(message, this.#getTimestampInHrTime(), "warn", SeverityNumber.WARN, properties);
  }

  error(message: string, properties?: Record<string, unknown>) {
    if (this._level < 1) return; // ["none", "error", "warn", "info", "debug"];

    this.#emitLog(message, this.#getTimestampInHrTime(), "error", SeverityNumber.ERROR, properties);
  }

  #emitLog(
    message: string,
    timestamp: ClockTime,
    severityText: string,
    severityNumber: SeverityNumber,
    properties?: Record<string, unknown>
  ) {
    let attributes: Attributes = { ...flattenAttributes(safeJsonProcess(properties)) };

    const icon = iconStringForSeverity(severityNumber);
    if (icon !== undefined) {
      attributes[SemanticInternalAttributes.STYLE_ICON] = icon;
    }

    this._config.logger.emit({
      severityNumber,
      severityText,
      body: message,
      attributes,
      timestamp,
    });
  }

  trace<T>(name: string, fn: (span: Span) => Promise<T>, options?: SpanOptions): Promise<T> {
    return this._config.tracer.startActiveSpan(name, fn, options);
  }

  startSpan(name: string, options?: SpanOptions): Span {
    return this._config.tracer.startSpan(name, options);
  }

  #getTimestampInHrTime(): ClockTime {
    return clock.preciseNow();
  }
}

export class NoopTaskLogger implements TaskLogger {
  debug() {}
  log() {}
  info() {}
  warn() {}
  error() {}
  trace<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T> {
    return fn({} as Span);
  }
  startSpan(): Span {
    return {} as Span;
  }
}

function safeJsonProcess(value?: Record<string, unknown>): Record<string, unknown> | undefined {
  try {
    return JSON.parse(JSON.stringify(value, jsonErrorReplacer));
  } catch {
    return value;
  }
}

function jsonErrorReplacer(key: string, value: unknown) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  return value;
}
