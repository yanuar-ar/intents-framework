import { AddressZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { Wallet } from "@ethersproject/wallet";
import { chainMetadata } from "@hyperlane-xyz/registry";
import { MultiProvider } from "@hyperlane-xyz/sdk";
import { ensure0x } from "@hyperlane-xyz/utils";

import DESTINATION_SETTLER_ABI from "../contracts/abi/destinationSettler";
import { Erc20__factory } from "../contracts/typechain/factories/ERC20__factory";

import { Provider } from "@ethersproject/abstract-provider";
import { BigNumber } from "ethers";
import type { OpenEventArgs, ResolvedCrossChainOrder } from "../types";

const create = () => {
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
  const amountByTokenByChain = resolvedOrder.maxSpent.reduce<{
    [chainId: number]: { [token: string]: BigNumber };
  }>((acc, output) => {
    const chainId = output.chainId.toNumber();

    acc[chainId] ||= { [output.token]: BigNumber.from(0) };
    acc[chainId][output.token] ||= BigNumber.from(0);

    acc[chainId][output.token] = acc[chainId][output.token].add(output.amount);

    return acc;
  }, {});

  const chainIdsWithEnoughTokens = new Set(
    Object.keys(
      (
        await Promise.all(
          Object.entries(amountByTokenByChain).map(([chainId, token]) =>
            checkChainTokens(multiProvider, chainId, token),
          ),
        )
      ).filter(({ chainId }) => chainId),
    ),
  );

  const fillInstructions = resolvedOrder.fillInstructions.filter((output) =>
    chainIdsWithEnoughTokens.has(output.destinationChainId.toString()),
  );

  return { fillInstructions };
}

async function checkChainTokens(
  multiProvider: MultiProvider,
  chainId: string,
  token: { [token: string]: BigNumber },
) {
  const provider = multiProvider.getProvider(chainId);
  const fillerAddress = await multiProvider.getSignerAddress(chainId);

  const hasEnoughTokens = await Promise.all(
    Object.entries(token).map(checkTokenBalance(provider, fillerAddress)),
  );

  return { chainId: hasEnoughTokens.every(Boolean) };
}

function checkTokenBalance(provider: Provider, fillerAddress: string) {
  return async ([tokenAddress, amount]: [string, BigNumber]) => {
    let balance: BigNumber;

    if (tokenAddress === AddressZero) {
      balance = await provider.getBalance(fillerAddress);
    } else {
      const token = Erc20__factory.connect(tokenAddress, provider);
      balance = await token.balanceOf(fillerAddress);
    }

    return balance.gte(amount);
  };
}

async function fill(
  orderId: string,
  fillInstructions: ResolvedCrossChainOrder["fillInstructions"],
  multiProvider: MultiProvider,
): Promise<void> {
  await Promise.all(
    fillInstructions.map(async (output) => {
      const filler = multiProvider.getSigner(output.destinationChainId.toNumber());

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

export const onChain = { create };
