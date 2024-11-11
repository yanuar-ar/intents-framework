import fs from "node:fs";

import type { MultiProvider } from "@hyperlane-xyz/sdk";
import { parse } from "yaml";

import { LogFormat, Logger, LogLevel } from "../../logger.js";
import type { IntentCreatedEventObject } from "../../typechain/eco/contracts/IntentSource.js";
import { HyperProver__factory } from "../../typechain/factories/eco/contracts/HyperProver__factory.js";
import { IntentSource__factory } from "../../typechain/factories/eco/contracts/IntentSource__factory.js";
import type { EcoMetadata } from "./types.js";

export const log = new Logger(LogFormat.Pretty, LogLevel.Info, "Eco");

export async function withdrawRewards(
  intent: IntentCreatedEventObject,
  intentSource: EcoMetadata["intentSource"],
  multiProvider: MultiProvider,
) {
  const { _hash, _prover } = intent;

  log.info("Waiting for `IntentProven` event on origin chain");
  const signer = multiProvider.getSigner(intentSource.chainId);

  const claimantAddress = await signer.getAddress();
  const prover = HyperProver__factory.connect(_prover, signer);

  await new Promise((resolve) =>
    prover.once(
      prover.filters.IntentProven(_hash, claimantAddress),
      async () => {
        log.debug("Intent proven:", _hash);

        log.info("About to claim rewards");
        const settler = IntentSource__factory.connect(
          intentSource.address,
          signer,
        );
        const tx = await settler.withdrawRewards(_hash);

        const receipt = await tx.wait();

        const baseUrl = multiProvider.getChainMetadata(intentSource.chainId)
          .blockExplorers?.[0].url;

        if (baseUrl) {
          log.info(
            `Withdraw Rewards Tx: ${baseUrl}/tx/${receipt.transactionHash}`,
          );
        } else {
          log.info("Withdraw Rewards Tx:", receipt.transactionHash);
        }

        log.debug(
          "Reward withdrawn on",
          intentSource.chainId,
          "for intent",
          _hash,
        );

        resolve(_hash);
      },
    ),
  );
}

export function getMetadata(): EcoMetadata {
  log.debug("Reading metadata from metadata.yaml");
  // TODO: make it generic, so it can be used for other solvers
  const data = fs.readFileSync("solvers/eco/metadata.yaml", "utf8");
  const metadata = parse(data) as EcoMetadata;

  log.debug("Metadata read:", JSON.stringify(metadata, null, 2));

  return metadata;
}
