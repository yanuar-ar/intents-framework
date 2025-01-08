import { AddressZero, Zero } from "@ethersproject/constants";
import type { MultiProvider } from "@hyperlane-xyz/sdk";
import type { BigNumber } from "ethers";

import { Erc20__factory } from "../../typechain/factories/contracts/Erc20__factory.js";

import type { Provider } from "@ethersproject/abstract-provider";
import { bytes32ToAddress } from "@hyperlane-xyz/utils";
import { createLogger } from "../../logger.js";
import { Hyperlane7683__factory } from "../../typechain/factories/hyperlane7683/contracts/Hyperlane7683__factory.js";
import { metadata } from "./config/index.js";
import type { ResolvedCrossChainOrder } from "./types.js";

export const log = createLogger(metadata.protocolName);

export async function checkChainTokens(
  multiProvider: MultiProvider,
  chainId: string,
  token: { [token: string]: BigNumber },
): Promise<[string, boolean]> {
  const provider = multiProvider.getProvider(chainId);
  const fillerAddress = await multiProvider.getSignerAddress(chainId);

  const hasEnoughTokens = await Promise.all(
    Object.entries(token).map(checkTokenBalance(provider, fillerAddress)),
  );

  return [chainId, hasEnoughTokens.every(Boolean)];
}

export function checkTokenBalance(provider: Provider, fillerAddress: string) {
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

export async function getChainIdsWithEnoughTokens(
  resolvedOrder: ResolvedCrossChainOrder,
  multiProvider: MultiProvider,
) {
  const amountByTokenByChain = resolvedOrder.maxSpent.reduce<{
    [chainId: number]: { [token: string]: BigNumber };
  }>((acc, { token, ...output }) => {
    token = bytes32ToAddress(token);
    const chainId = output.chainId.toNumber();

    acc[chainId] ||= { [token]: Zero };
    acc[chainId][token] ||= Zero;

    acc[chainId][token] = acc[chainId][token].add(output.amount);

    return acc;
  }, {});

  const _checkedChains: Array<Promise<[string, boolean]>> = [];
  for (const chainId in amountByTokenByChain) {
    _checkedChains.push(
      checkChainTokens(multiProvider, chainId, amountByTokenByChain[chainId]),
    );
  }

  return (await Promise.all(_checkedChains))
    .filter(([, hasEnoughTokens]) => hasEnoughTokens)
    .map(([chainId]) => chainId);
}

export async function settleOrder(
  fillInstructions: ResolvedCrossChainOrder["fillInstructions"],
  orderId: string,
  multiProvider: MultiProvider,
  solverName: string,
) {
  log.info({
    msg: "Settling Intent",
    intent: `${solverName}-${orderId}`,
  });

  const destinationSettlers = fillInstructions.reduce<
    Record<string, Array<string>>
  >((acc, fillInstruction) => {
    const destinationChain = fillInstruction.destinationChainId.toString();
    const destinationSettler = bytes32ToAddress(
      fillInstruction.destinationSettler,
    );

    acc[destinationChain] ||= [];
    acc[destinationChain].push(destinationSettler);

    return acc;
  }, {});

  await Promise.all(
    Object.entries(destinationSettlers).map(
      async ([destinationChain, settlers]) => {
        const uniqueSettlers = [...new Set(settlers)];
        const filler = multiProvider.getSigner(destinationChain);

        return Promise.all(
          uniqueSettlers.map(async (destinationSettler) => {
            const destination = Hyperlane7683__factory.connect(
              destinationSettler,
              filler,
            );

            const tx = await destination.settle([orderId], {
              value: await destination.quoteGasPayment(destinationChain),
            });

            const receipt = await tx.wait();

            log.info({
              msg: "Settled Intent",
              intent: `${solverName}-${orderId}`,
              txDetails: `https://explorer.hyperlane.xyz/?search=${receipt.transactionHash}`,
              txHash: receipt.transactionHash,
            });
          }),
        );
      },
    ),
  );
}
