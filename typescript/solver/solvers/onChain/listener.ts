import { chainMetadata } from "@hyperlane-xyz/registry";
import { MultiProvider } from "@hyperlane-xyz/sdk";

import { OriginSettler__factory } from "../../contracts/typechain/factories/OriginSettler__factory.js";
import { logGreen } from "../../logger.js";
import type { OpenEventArgs } from "../../types.js";

export const create = () => {
  const { settlerContract } = setup();

  return function onChain(handler: (openEventArgs: OpenEventArgs) => void) {
    settlerContract.on(
      settlerContract.filters.Open(),
      (orderId, resolvedOrder) => {
        handler({ orderId, resolvedOrder });
      },
    );

    logGreen("Started listening for Open events");
  };
};

function setup() {
  const address = process.env.ORIGIN_SETTLER_ADDRESS;
  const chainId = process.env.ORIGIN_SETTLER_CHAIN_ID;

  if (!address || !chainId) {
    throw new Error("Origin settler information must be provided");
  }

  const multiProvider = new MultiProvider(chainMetadata);
  const provider = multiProvider.getProvider(chainId);

  const settlerContract = OriginSettler__factory.connect(address, provider);

  return { settlerContract };
}
