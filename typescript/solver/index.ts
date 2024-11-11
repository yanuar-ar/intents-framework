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

  const onChainListener = solvers["onChain"].listener.create();
  const onChainFiller = solvers["onChain"].filler.create();

  onChainListener(onChainFiller);
};

main();
