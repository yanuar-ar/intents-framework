import { chainMetadata } from "@hyperlane-xyz/registry";
import { MultiProvider } from "@hyperlane-xyz/sdk";

import { OriginSettler__factory } from "../../typechain/factories/onChain/contracts/OriginSettler__factory.js";
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
      log.green(
        "Started listening for Open events on",
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

  const settlerContract = OriginSettler__factory.connect(
    metadata.originSettler.address,
    provider,
  );

  return { settlerContract };
}
