import { chainMetadata } from "@hyperlane-xyz/registry";
import { MultiProvider } from "@hyperlane-xyz/sdk";

import {
  ORIGIN_SETTLER_ADDRESS,
  ORIGIN_SETTLER_CHAIN_ID,
} from "../../config.js";
import { logGreen } from "../../logger.js";
import { IntentCreatedEventObject } from "../../typechain/eco/contracts/IntentSource.js";
import { IntentSource__factory } from "../../typechain/factories/eco/contracts/IntentSource__factory.js";

export const create = () => {
  const { settlerContract } = setup();

  return function onChain(handler: (intentCreatedEvent: IntentCreatedEventObject) => void) {
    settlerContract.on(
      settlerContract.filters.IntentCreated(),
      (
        _hash,
        _creator,
        _destinationChain,
        _targets,
        _data,
        _rewardTokens,
        _rewardAmounts,
        _expiryTime,
        nonce,
        _prover,
      ) => {
        handler({
          _hash,
          _creator,
          _destinationChain,
          _targets,
          _data,
          _rewardTokens,
          _rewardAmounts,
          _expiryTime,
          nonce,
          _prover
        });
      },
    );

    settlerContract.provider.getNetwork().then((network) => {
      logGreen(
        "Started listening for Open events on",
        Object.values(chainMetadata).find(
          (metadata) => metadata.chainId === network.chainId,
        )?.displayName,
      );
    });
  };
};

function setup() {
  if (!ORIGIN_SETTLER_ADDRESS || !ORIGIN_SETTLER_CHAIN_ID) {
    throw new Error("Origin settler information must be provided");
  }

  const multiProvider = new MultiProvider(chainMetadata);
  const provider = multiProvider.getProvider(ORIGIN_SETTLER_CHAIN_ID);

  const settlerContract = IntentSource__factory.connect(
    ORIGIN_SETTLER_ADDRESS,
    provider,
  );

  return { settlerContract };
}
