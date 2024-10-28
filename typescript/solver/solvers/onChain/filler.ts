import { Contract } from "@ethersproject/contracts";
import { Wallet } from "@ethersproject/wallet";
import { chainMetadata } from "@hyperlane-xyz/registry";
import { MultiProvider } from "@hyperlane-xyz/sdk";
import { ensure0x } from "@hyperlane-xyz/utils";

import DESTINATION_SETTLER_ABI from "../../contracts/abi/destinationSettler";
import type { OpenEventArgs, ResolvedCrossChainOrder } from "../../types";
import { getChainIdsWithEnoughTokens } from "./utils";

export const create = () => {
  const { multiProvider } = setup();

  return async function onChain({ orderId, resolvedOrder }: OpenEventArgs) {
    const { fillInstructions } = await selectOutputs(
      resolvedOrder,
      multiProvider,
    );

    await fill(orderId, fillInstructions, multiProvider);
  };
};

function setup() {
  const privateKey = process.env.PRIVATE_KEY;
  const mnemonic = process.env.MNEMONIC;

  if (!privateKey && !mnemonic) {
    throw new Error("Either a private key or mnemonic must be provided");
  }

  const multiProvider = new MultiProvider(chainMetadata);
  const wallet = privateKey
    ? new Wallet(ensure0x(privateKey))
    : Wallet.fromMnemonic(mnemonic!);
  multiProvider.setSharedSigner(wallet);

  return { multiProvider };
}

// We're assuming the filler will pay out of their own stock, but in reality they may have to
// produce the funds before executing each leg.
async function selectOutputs(
  resolvedOrder: ResolvedCrossChainOrder,
  multiProvider: MultiProvider,
) {
  const chainIdsWithEnoughTokens = await getChainIdsWithEnoughTokens(
    resolvedOrder,
    multiProvider,
  );

  const fillInstructions = resolvedOrder.fillInstructions.filter((output) =>
    chainIdsWithEnoughTokens.includes(output.destinationChainId.toString()),
  );

  return { fillInstructions };
}

async function fill(
  orderId: string,
  fillInstructions: ResolvedCrossChainOrder["fillInstructions"],
  multiProvider: MultiProvider,
): Promise<void> {
  await Promise.all(
    fillInstructions.map(async (output) => {
      const filler = multiProvider.getSigner(
        output.destinationChainId.toNumber(),
      );

      const destinationSettler = output.destinationSettler;
      const destination = new Contract(
        destinationSettler,
        DESTINATION_SETTLER_ABI,
        filler,
      );

      const originData = output.originData;
      // Depending on the implementation we may call `destination.fill` directly or call some other
      // contract that will produce the funds needed to execute this leg and then in turn call
      // `destination.fill`
      await destination.fill(orderId, originData, "");
    }),
  );
}
