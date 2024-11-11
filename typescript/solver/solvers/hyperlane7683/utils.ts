import fs from "fs";

import { AddressZero, Zero } from "@ethersproject/constants";
import { formatUnits } from "@ethersproject/units";
import type { MultiProvider } from "@hyperlane-xyz/sdk";
import type { BigNumber } from "ethers";
import { parse } from "yaml";

import { Erc20__factory } from "../../typechain/factories/contracts/Erc20__factory.js";

import type { Provider } from "@ethersproject/abstract-provider";
import { bytes32ToAddress, LogFormat, LogLevel } from "@hyperlane-xyz/utils";
import { Logger } from "../../logger.js";
import { Hyperlane7683__factory } from "../../typechain/factories/hyperlane7683/contracts/Hyperlane7683__factory.js";
import type {
  Hyperlane7683Metadata,
  ResolvedCrossChainOrder,
} from "./types.js";

export const log = new Logger(
  LogFormat.Pretty,
  LogLevel.Info,
  "Hyperlane7683-Solver",
);

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
) {
  log.info(`Settling Intent: Hyperlane7683-${orderId}`);

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

            log.info(
              `Settled Intent: Hyperlane7683-${orderId}, info: https://explorer.hyperlane.xyz/?search=${receipt.transactionHash}`,
            );

            log.debug(
              "Settled order",
              orderId,
              "on chain",
              destinationChain.toString(),
            );
          }),
        );
      },
    ),
  );
}

export async function retrieveOriginInfo(
  resolvedOrder: ResolvedCrossChainOrder,
  originSettler: Hyperlane7683Metadata["originSettler"],
  multiProvider: MultiProvider,
): Promise<Array<string>> {
  const originInfo = await Promise.all(
    resolvedOrder.minReceived.map(async ({ amount, chainId, token }) => {
      const erc20 = Erc20__factory.connect(
        bytes32ToAddress(token),
        multiProvider.getProvider(chainId.toString()),
      );
      const [decimals, symbol] = await Promise.all([
        erc20.decimals(),
        erc20.symbol(),
      ]);

      return { amount, decimals, symbol };
    }),
  );

  const originChain = originSettler.chainName ?? "UNKNOWN_CHAIN";

  return originInfo.map(
    ({ amount, decimals, symbol }) =>
      `${formatUnits(amount, decimals)} ${symbol} in on ${originChain}`,
  );
}

export async function retrieveTargetInfo(
  resolvedOrder: ResolvedCrossChainOrder,
  multiProvider: MultiProvider,
): Promise<Array<string>> {
  const targetInfo = await Promise.all(
    resolvedOrder.maxSpent.map(async ({ amount, chainId, token }) => {
      const erc20 = Erc20__factory.connect(
        bytes32ToAddress(token),
        multiProvider.getProvider(chainId.toString()),
      );
      const [decimals, symbol] = await Promise.all([
        erc20.decimals(),
        erc20.symbol(),
      ]);

      return { amount, decimals, symbol };
    }),
  );

  return targetInfo.map(
    ({ amount, decimals, symbol }) =>
      `${formatUnits(amount, decimals)} ${symbol} on base-sepolia`,
  );
}

export function getMetadata(): Hyperlane7683Metadata {
  log.debug("Reading metadata from metadata.yaml");
  // TODO: make it generic, so it can be used for other solvers
  const data = fs.readFileSync("solvers/hyperlane7683/metadata.yaml", "utf8");
  const metadata = parse(data) as Hyperlane7683Metadata;

  log.debug("Metadata read:", JSON.stringify(metadata, null, 2));

  return metadata;
}
