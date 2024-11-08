import { chainMetadata } from "@hyperlane-xyz/registry";
import { MultiProvider } from "@hyperlane-xyz/sdk";

import { logGreen } from "../../logger.js";
import { IntentCreatedEventObject } from "../../typechain/eco/contracts/IntentSource.js";
import { IntentSource__factory } from "../../typechain/factories/eco/contracts/IntentSource__factory.js";
import { getMetadata } from "./utils.js";

export const create = () => {
  const { settlerContract } = setup();

  return function onChain(
    handler: (intentCreatedEvent: IntentCreatedEventObject) => void,
  ) {
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
          _prover,
        });
      },
    );

    settlerContract.provider.getNetwork().then((network) => {
      logGreen(
        "Started listening for IntentCreated events on",
        Object.values(chainMetadata).find(
          (metadata) => metadata.chainId === network.chainId,
        )?.displayName,
      );
    });
  };
};

function setup() {
  const metadata = getMetadata();

  if (!metadata.intentSource.address || !metadata.intentSource.chainId) {
    throw new Error("Origin settler information must be provided");
  }

  const multiProvider = new MultiProvider(chainMetadata);
  const provider = multiProvider.getProvider(metadata.intentSource.chainId);

  const settlerContract = IntentSource__factory.connect(
    metadata.intentSource.address,
    provider,
  );

  return { settlerContract };
}
