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

    // Query past events
    //   const fromBlock = 19250837;
    //   const toBlock = 19250839;
    //   settlerContract
    //     .queryFilter(settlerContract.filters.Open(), fromBlock, toBlock)
    //     .then((events) => {
    //       events.forEach((event) => {
    //         handler({
    //           orderId: event.args.orderId,
    //           resolvedOrder: event.args.resolvedOrder,
    //         });
    //       });
    //     });

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
