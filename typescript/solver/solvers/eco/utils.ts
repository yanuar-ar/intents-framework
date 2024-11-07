import { MultiProvider } from "@hyperlane-xyz/sdk";

import { logDebug, logGreen } from "../../logger.js";
import { HyperProver__factory } from "../../typechain/factories/eco/contracts/HyperProver__factory.js";
import { IntentSource__factory } from "../../typechain/factories/eco/contracts/IntentSource__factory.js";
import { IntentCreatedEventObject } from "../../typechain/eco/contracts/IntentSource.js";

export async function withdrawRewards(
  intent: IntentCreatedEventObject,
  originSettlerAddress: string,
  originChainId: string,
  multiProvider: MultiProvider,
) {
  const { _hash, _prover } = intent;

  logGreen("Waiting for `IntentProven` event on origin chain");
  const signer = multiProvider.getSigner(originChainId);
  const claimantAddress = await signer.getAddress();
  const prover = HyperProver__factory.connect(_prover, signer);

  await new Promise((resolve) =>
    prover.once(
      prover.filters.IntentProven(_hash, claimantAddress),
      async () => {
        logDebug("Intent proven:", _hash);

        logGreen("About to claim rewards");
        const settler = IntentSource__factory.connect(
          originSettlerAddress,
          signer,
        );
        const tx = await settler.withdrawRewards(_hash);

        const receipt = await tx.wait();

        const baseUrl =
          multiProvider.getChainMetadata(originChainId).blockExplorers?.[0].url;

        if (baseUrl) {
          logGreen(
            `Withdraw Rewards Tx: ${baseUrl}/tx/${receipt.transactionHash}`,
          );
        } else {
          logGreen("Withdraw Rewards Tx:", receipt.transactionHash);
        }

        logDebug("Reward withdrawn on", originChainId, "for intent", _hash);

        resolve(_hash);
      },
    ),
  );
}
