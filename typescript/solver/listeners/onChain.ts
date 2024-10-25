import { chainMetadata } from "@hyperlane-xyz/registry";
import { MultiProvider } from "@hyperlane-xyz/sdk";

import { OriginSettler__factory } from "../contracts/typechain/factories/OriginSettler__factory";
import type { OpenEventArgs } from "../types";

const create = () => {
  const { settlerContract } = setup();

  return function onChain(handler: (openEventArgs: OpenEventArgs) => void) {
    settlerContract.on(settlerContract.filters.Open(), (_from, _to, event) => {
      const { orderId, resolvedOrder } = event.args;

      handler({ orderId, resolvedOrder: resolvedOrder });
    });
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

export const onChain = { create };
