import { Wallet } from "@ethersproject/wallet";
import { chainMetadata } from "@hyperlane-xyz/registry";
import { MultiProvider } from "@hyperlane-xyz/sdk";
import { bytes32ToAddress, ensure0x } from "@hyperlane-xyz/utils";

import { DestinationSettler__factory } from "../../contracts/typechain/factories/DestinationSettler__factory.js";
import { Erc20__factory } from "../../contracts/typechain/factories/Erc20__factory.js";
import { logDebug, logGreen } from "../../logger.js";
import type { OpenEventArgs, ResolvedCrossChainOrder } from "../../types.js";
import { getChainIdsWithEnoughTokens } from "./utils.js";

export const create = () => {
  const { multiProvider } = setup();

  return async function onChain({ orderId, resolvedOrder }: OpenEventArgs) {
    logGreen("Received Order:", orderId);

    const { fillInstructions, maxSpent } = await selectOutputs(
      resolvedOrder,
      multiProvider,
    );

    await fill(orderId, fillInstructions, maxSpent, multiProvider);

    logGreen(`Filled ${fillInstructions.length} legs for:`, orderId);
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
  logDebug("Chain IDs with enough tokens:", chainIdsWithEnoughTokens);

  const fillInstructions = resolvedOrder.fillInstructions.filter(
    ({ destinationChainId }) =>
      chainIdsWithEnoughTokens.includes(destinationChainId.toString()),
  );
  logDebug("fillInstructions:", JSON.stringify(fillInstructions));

  const maxSpent = resolvedOrder.maxSpent.filter(({ chainId }) =>
    chainIdsWithEnoughTokens.includes(chainId.toString()),
  );
  logDebug("maxSpent:", JSON.stringify(maxSpent));

  return { fillInstructions, maxSpent };
}

async function fill(
  orderId: string,
  fillInstructions: ResolvedCrossChainOrder["fillInstructions"],
  maxSpent: ResolvedCrossChainOrder["maxSpent"],
  multiProvider: MultiProvider,
): Promise<void> {
  logGreen("About to fill", fillInstructions.length, "legs for", orderId);

  await Promise.all(
    maxSpent.map(async ({ chainId, token, amount, recipient }) => {
      token = bytes32ToAddress(token);
      recipient = bytes32ToAddress(recipient);

      const filler = multiProvider.getSigner(chainId.toString());
      const receipt = await Erc20__factory.connect(token, filler).approve(
        recipient,
        amount,
      );

      await receipt.wait();

      logDebug(
        "Approved",
        amount.toString(),
        "of",
        token,
        "to",
        recipient,
        "on",
        chainId.toString(),
      );
    }),
  );

  await Promise.all(
    fillInstructions.map(
      async ({ destinationChainId, destinationSettler, originData }) => {
        destinationSettler = bytes32ToAddress(destinationSettler);
        const filler = multiProvider.getSigner(destinationChainId.toString());

        const destination = DestinationSettler__factory.connect(
          destinationSettler,
          filler,
        );

        // Depending on the implementation we may call `destination.fill` directly or call some other
        // contract that will produce the funds needed to execute this leg and then in turn call
        // `destination.fill`
        const receipt = await destination.fill(orderId, originData, "0x");

        await receipt.wait();

        logDebug(
          "Filled leg on",
          destinationChainId.toString(),
          "with data",
          originData,
        );
      },
    ),
  );
}
