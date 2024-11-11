import chalk, { type ChalkInstance } from "chalk";
import { type Logger as PinoLogger, pino } from "pino";

import {
  LogFormat,
  LogLevel,
  configureRootLogger,
  getLogFormat,
  rootLogger,
  safelyAccessEnvVar,
} from "@hyperlane-xyz/utils";
import uniqolor from "uniqolor";

class Logger {
  infoChalkInstance: ChalkInstance;
  logger: PinoLogger = rootLogger;

  constructor(logFormat: LogFormat, logLevel: LogLevel, label?: string) {
    this.infoChalkInstance = label
      ? chalk.hex(uniqolor(label).color)
      : chalk.green;
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
      this.logger[level](chalkInstance(...args));
    } else {
      // @ts-ignore pino type more restrictive than pino's actual arg handling
      this.logger[level](...args);
    }
  }

  subtitle(...args: any) {
    this.logColor("info", chalk.blue, ...args);
  }
  info(...args: any) {
    this.logColor("info", this.infoChalkInstance, ...args);
  }
  title(...args: any) {
    this.logColor("info", chalk.blue.bold, ...args);
  }
  warn(...args: any) {
    this.logColor("warn", chalk.yellow, ...args);
  }
  error(...args: any) {
    this.logColor("error", chalk.red, ...args);
  }
  debug(msg: string, ...args: any) {
    this.logger.debug(msg, ...args);
  }
}

const log = new Logger(LogFormat.Pretty, LogLevel.Info);

export { LogFormat, LogLevel, Logger, log };
