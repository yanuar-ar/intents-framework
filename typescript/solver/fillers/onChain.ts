import { Contract } from "@ethersproject/contracts";
import { Wallet } from "@ethersproject/wallet";
import { chainMetadata } from "@hyperlane-xyz/registry";
import { MultiProvider } from "@hyperlane-xyz/sdk";
import { ensure0x } from "@hyperlane-xyz/utils";

import DESTINATION_SETTLER_ABI from "../contracts/abi/destinationSettler";
import { Erc20__factory } from "../contracts/typechain/factories/ERC20__factory";

import type { OpenEventArgs, ResolvedCrossChainOrder } from "../types";

const create = () => {
  const { multiProvider } = setup();

  return async function onChain({ orderId, resolvedOrder }: OpenEventArgs) {
    const { outputs, fillInstructions } = await selectOutputs(
      resolvedOrder,
      multiProvider,
    );

    await fill(orderId, outputs, fillInstructions, multiProvider);
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

async function selectOutputs(
  resolvedOrder: ResolvedCrossChainOrder,
  multiProvider: MultiProvider,
) {
  // We're assuming the filler will pay out of their own stock, but in reality they may have to
  // produce the funds before executing each leg.
  const results = await Promise.all(
    resolvedOrder.maxSpent.map(async (output): Promise<boolean> => {
      const provider = multiProvider.getProvider(output.chainId.toNumber());
      const fillerAddress = await multiProvider.getSignerAddress(
        output.chainId.toNumber(),
      );
      const token = Erc20__factory.connect(output.token, provider);
      const balance = await token.balanceOf(fillerAddress);

      return balance.gte(output.amount);
    }),
  );

  const outputs = resolvedOrder.maxSpent.filter((_, index) => {
    results[index];
  });

  const fillInstructions = resolvedOrder.fillInstructions.filter((_, index) => {
    results[index];
  });

  return { outputs, fillInstructions };
}

async function fill(
  orderId: string,
  outputs: ResolvedCrossChainOrder["maxSpent"],
  fillInstructions: ResolvedCrossChainOrder["fillInstructions"],
  multiProvider: MultiProvider,
): Promise<void> {
  await Promise.all(
    outputs.map(async (output, index): Promise<void> => {
      const filler = multiProvider.getSigner(output.chainId.toNumber());

      const destinationSettler = fillInstructions[index].destinationSettler;
      const destination = new Contract(
        destinationSettler,
        DESTINATION_SETTLER_ABI,
        filler,
      );

      const originData = fillInstructions[index].originData;
      // Depending on the implementation we may call `destination.fill` directly or call some other
      // contract that will produce the funds needed to execute this leg and then in turn call
      // `destination.fill`
      await destination.fill(orderId, originData, "");
    }),
  );
}

export const onChain = { create };
