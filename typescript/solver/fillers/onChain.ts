import { Contract } from "@ethersproject/contracts";
import { Wallet } from "@ethersproject/wallet";
import { ensure0x } from "@hyperlane-xyz/utils";
import { chainMetadata } from '@hyperlane-xyz/registry';
import { MultiProvider } from '@hyperlane-xyz/sdk';

import DESTINATION_SETTLER_ABI from "../abi/destinationSettler";

import type { FillInstruction, OpenEventArgs, Output } from "../types";

const create = () => {
  const { multiProvider } = setup();

  return async function onChain({ orderId, resolvedOrder }: OpenEventArgs) {
    const { maxSpent: outputs, minReceived: inputs, fillInstructions } = resolvedOrder;

    if (!(await isProfitable(inputs, outputs, multiProvider))) {
      console.log("Not profitable");
      return;
    }

    if (!(await hasEnoughFunds(outputs, multiProvider))) {
      console.log("Not enough funds");
      return;
    }

    await fill(orderId, outputs, fillInstructions, multiProvider);
  }
}

function setup() {
  const privateKey = process.env.PRIVATE_KEY;
  const mnemonic = process.env.MNEMONIC;

  if (!privateKey && !mnemonic) {
    throw new Error("Either a private key or mnemonic must be provided");
  }

  const multiProvider = new MultiProvider(chainMetadata);
  const wallet = privateKey ? new Wallet(ensure0x(privateKey)) : Wallet.fromMnemonic(mnemonic!);
  multiProvider.setSharedSigner(wallet);

  return { multiProvider };
}

async function isProfitable(inputs: Array<Output>, outputs: Array<Output>, multiProvider: MultiProvider): Promise<boolean> {
  // It's still not clear if there MUST be an input for every output, so maybe it doesn't make any
  // sense to think about it this way, but we somehow need to decide whether exchanging `inputs` for
  // `outputs` is a good deal for us.
  await Promise.all(inputs.map(async (input, index): Promise<void> => {
    const output = outputs[index];
    const provider = multiProvider.getProvider(output.chainId);
    console.log(await provider.getBlockNumber(), input.token, input.amount, output.token, output.amount);
  }));
  return true;
}

async function hasEnoughFunds(outputs: Array<Output>, multiProvider: MultiProvider): Promise<boolean> {
  // We're assuming the filler will pay out of their own stock, but in reality they may have to
  // produce the funds before executing each leg.
  await Promise.all(outputs.map(async (output): Promise<void> => {
    const filler = multiProvider.getSigner(output.chainId);
    // Check filler has at least output.amount of output.token available for executing this leg.
    console.log(await filler.getAddress(), output.token, output.amount);
  }));
  return true;
}

async function fill(orderId: string, outputs: Array<Output>, fillInstructions: Array<FillInstruction>, multiProvider: MultiProvider): Promise<void> {
  await Promise.all(outputs.map(async (output, index): Promise<void> => {
    const filler = multiProvider.getSigner(output.chainId);

    const destinationSettler = fillInstructions[index].destinationSettler;
    const destination = new Contract(destinationSettler, DESTINATION_SETTLER_ABI, filler);

    const originData = fillInstructions[index].originData;
    // Depending on the implementation we may call `destination.fill` directly or call some other
    // contract that will produce the funds needed to execute this leg and then in turn call
    // `destination.fill`
    await destination.fill(orderId, originData, "");
  }));
}

export const onChain = { create };
