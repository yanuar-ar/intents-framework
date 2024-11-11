import { chainMetadata } from "@hyperlane-xyz/registry";
import { MultiProvider } from "@hyperlane-xyz/sdk";

import { Hyperlane7683__factory } from "../../typechain/factories/hyperlane7683/contracts/Hyperlane7683__factory.js";
import type { OpenEventArgs } from "./types.js";
import { getMetadata, log } from "./utils.js";

export const create = () => {
  const { settlerContract } = setup();

  return function onChain(handler: (openEventArgs: OpenEventArgs) => void) {
    settlerContract.on(
      settlerContract.filters.Open(),
      (orderId, resolvedOrder) => {
        handler({ orderId, resolvedOrder });
      },
    );

    settlerContract.provider.getNetwork().then((network) => {
      log.info(
        "Started listening for Hyperlane7683-Open events on",
        Object.values(chainMetadata).find(
          (metadata) => metadata.chainId === network.chainId,
        )?.displayName,
      );
    });
  };
};

function setup() {
  const metadata = getMetadata();

  if (!metadata.originSettler.address || !metadata.originSettler.chainId) {
    throw new Error("Origin settler information must be provided");
  }

  const multiProvider = new MultiProvider(chainMetadata);
  const provider = multiProvider.getProvider(metadata.originSettler.chainId);

  const settlerContract = Hyperlane7683__factory.connect(
    metadata.originSettler.address,
    provider,
  );

  return { settlerContract };
}
