import { chainMetadata } from "@hyperlane-xyz/registry";
import { MultiProvider } from "@hyperlane-xyz/sdk";

import {
  ORIGIN_SETTLER_ADDRESS,
  ORIGIN_SETTLER_CHAIN_ID,
} from "../../config.js";
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
  if (!ORIGIN_SETTLER_ADDRESS || !ORIGIN_SETTLER_CHAIN_ID) {
    throw new Error("Origin settler information must be provided");
  }

  const multiProvider = new MultiProvider(chainMetadata);
  const provider = multiProvider.getProvider(ORIGIN_SETTLER_CHAIN_ID);

  const settlerContract = OriginSettler__factory.connect(
    ORIGIN_SETTLER_ADDRESS,
    provider,
  );

  return { settlerContract };
}
