#!/usr/bin/env node

import "./patch-bigint-buffer-warn.js";

import { LogFormat, LogLevel } from "@hyperlane-xyz/utils";

import { configureLogger, logBlue, logBoldBlue } from "./logger.js";
import * as solvers from "./solvers/index.js";

configureLogger(LogFormat.Pretty, LogLevel.Debug);

logBoldBlue("🙍 Intent Solver 📝");

const main = () => {
  logBlue("Starting solver...");

  // TODO: implement a way to choose different listeners and fillers
  const listener = solvers["eco"].listener.create();
  const filler = solvers["eco"].filler.create();

  listener(filler);
};

main();
