#!/usr/bin/env node

import "./patch-bigint-buffer-warn.js";

import { chainMetadata } from "./config/chainMetadata.js";
import { log } from "./logger.js";
import * as solvers from "./solvers/index.js";
import { getMultiProvider } from "./solvers/utils.js";

const main = async () => {
  const multiProvider = await getMultiProvider(chainMetadata).catch(
    (error) => (log.error(error.reason ?? error.message), process.exit(1)),
  );

  log.info("🙍 Intent Solver 📝");
  log.info("Starting...");

  // // TODO: implement a way to choose different listeners and fillers
  const hyperlane7683Listener = solvers["hyperlane7683"].listener.create();
  const hyperlane7683Filler =
    solvers["hyperlane7683"].filler.create(multiProvider);

  hyperlane7683Listener(hyperlane7683Filler);
};

await main();
