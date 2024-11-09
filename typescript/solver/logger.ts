import chalk, { ChalkInstance } from "chalk";
import { type Logger as PinoLogger, pino } from "pino";

import {
  LogFormat,
  LogLevel,
  configureRootLogger,
  getLogFormat,
  rootLogger,
  safelyAccessEnvVar,
} from "@hyperlane-xyz/utils";

class Logger {
  label;
  logger: PinoLogger = rootLogger;

  constructor(logFormat: LogFormat, logLevel: LogLevel, label?: string) {
    this.label = label ? `[${label}]` : undefined;
    this.logger = this.configureLogger(logFormat, logLevel);
  }

  private configureLogger(logFormat: LogFormat, logLevel: LogLevel) {
    logFormat =
      logFormat || safelyAccessEnvVar("LOG_FORMAT", true) || LogFormat.Pretty;
    logLevel =
      logLevel || safelyAccessEnvVar("LOG_LEVEL", true) || LogLevel.Info;
    return configureRootLogger(logFormat, logLevel).child({ module: "solver" });
  }

  logColor(level: pino.Level, chalkInstance: ChalkInstance, ...args: any) {
    // Only use color when pretty is enabled
    if (getLogFormat() === LogFormat.Pretty) {
      this.logger[level](chalkInstance(this.label, ...args));
    } else {
      // @ts-ignore pino type more restrictive than pino's actual arg handling
      this.logger[level](this.label, ...args);
    }
  }

  blue(...args: any) {
    this.logColor("info", chalk.blue, ...args);
  }
  green(...args: any) {
    this.logColor("info", chalk.green, ...args);
  }
  boldBlue(...args: any) {
    this.logColor("info", chalk.blue.bold, ...args);
  }
  warn(...args: any) {
    this.logColor("warn", chalk.yellow, ...args);
  }
  error(...args: any) {
    this.logColor("error", chalk.red, ...args);
  }
  debug(msg: string, ...args: any) {
    this.logger.debug(this.label, msg, ...args);
  }
}

const log = new Logger(LogFormat.Pretty, LogLevel.Info);

export { LogFormat, LogLevel, Logger, log };
