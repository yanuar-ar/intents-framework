#!/usr/bin/env node

import "./patch-bigint-buffer-warn.js";

import { LogFormat, Logger, LogLevel } from "./logger.js";
import * as solvers from "./solvers/index.js";

const log = new Logger(LogFormat.Pretty, LogLevel.Info);

log.title("🙍 Intent Solver 📝");

const main = () => {
  log.subtitle("Starting...", "\n");

  // TODO: implement a way to choose different listeners and fillers
  const ecoListener = solvers["eco"].listener.create();
  const ecoFiller = solvers["eco"].filler.create();

  ecoListener(ecoFiller);

  const hyperlane7683Listener = solvers["hyperlane7683"].listener.create();
  const hyperlane7683Filler = solvers["hyperlane7683"].filler.create();

  hyperlane7683Listener(hyperlane7683Filler);
};

main();
