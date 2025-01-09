import { Zero } from "@ethersproject/constants";
import { type MultiProvider } from "@hyperlane-xyz/sdk";
import { type Result } from "@hyperlane-xyz/utils";

import { type BigNumber } from "ethers";

import { chainIds, chainIdsToName } from "../../config/index.js";
import { Erc20__factory } from "../../typechain/factories/contracts/Erc20__factory.js";
import { EcoAdapter__factory } from "../../typechain/factories/eco/contracts/EcoAdapter__factory.js";
import { BaseFiller } from "../BaseFiller.js";
import { retrieveOriginInfo, retrieveTargetInfo } from "../utils.js";
import { allowBlockLists, metadata } from "./config/index.js";
import type { EcoMetadata, IntentData, ParsedArgs } from "./types.js";
import { log, withdrawRewards } from "./utils.js";

type Metadata = {
  adapters: { [chainId: string]: EcoMetadata["adapters"][number] };
  protocolName: EcoMetadata["protocolName"];
};

export class EcoFiller extends BaseFiller<Metadata, ParsedArgs, IntentData> {
  constructor(multiProvider: MultiProvider) {
    const { adapters, protocolName } = metadata;
    const ecoFillerMetadata = {
      adapters: adapters.reduce<{
        [chainId: string]: EcoMetadata["adapters"][number];
      }>(
        (acc, adapter) => ({
          ...acc,
          [chainIds[adapter.chainName]]: adapter,
        }),
        {},
      ),
      protocolName,
    };

    super(multiProvider, allowBlockLists, ecoFillerMetadata, log);
  }

  protected retrieveOriginInfo(parsedArgs: ParsedArgs, chainName: string) {
    const originTokens = parsedArgs._rewardTokens.map((tokenAddress, index) => {
      const amount = parsedArgs._rewardAmounts[index];
      return { amount, chainName, tokenAddress };
    });

    return retrieveOriginInfo({
      multiProvider: this.multiProvider,
      tokens: originTokens,
    });
  }

  protected retrieveTargetInfo(parsedArgs: ParsedArgs) {
    const chainId = parsedArgs._destinationChain.toString();
    const chainName = chainIdsToName[chainId];
    const erc20Interface = Erc20__factory.createInterface();

    const targetTokens = parsedArgs._targets.map((tokenAddress, index) => {
      const [, amount] = erc20Interface.decodeFunctionData(
        "transfer",
        parsedArgs._data[index],
      ) as [unknown, BigNumber];

      return { amount, chainName, tokenAddress };
    });

    return retrieveTargetInfo({
      multiProvider: this.multiProvider,
      tokens: targetTokens,
    });
  }

  protected async prepareIntent(
    parsedArgs: ParsedArgs,
  ): Promise<Result<IntentData>> {
    const adapter =
      this.metadata.adapters[parsedArgs._destinationChain.toString()];

    if (!adapter) {
      return {
        error: "No adapter found for destination chain",
        success: false,
      };
    }

    await super.prepareIntent(parsedArgs);

    try {
      const erc20Interface = Erc20__factory.createInterface();

      const requiredAmountsByTarget = parsedArgs._targets.reduce<{
        [tokenAddress: string]: BigNumber;
      }>((acc, target, index) => {
        const [, amount] = erc20Interface.decodeFunctionData(
          "transfer",
          parsedArgs._data[index],
        ) as [unknown, BigNumber];

        acc[target] ||= Zero;
        acc[target] = acc[target].add(amount);

        return acc;
      }, {});

      const fillerAddress = await this.multiProvider.getSignerAddress(
        adapter.chainName,
      );
      const signer = this.multiProvider.getSigner(adapter.chainName);

      const areTargetFundsAvailable = await Promise.all(
        Object.entries(requiredAmountsByTarget).map(
          async ([target, requiredAmount]) => {
            const erc20 = Erc20__factory.connect(target, signer);

            const balance = await erc20.balanceOf(fillerAddress);
            return balance.gte(requiredAmount);
          },
        ),
      );

      if (!areTargetFundsAvailable.every(Boolean)) {
        return { error: "Not enough tokens", success: false };
      }

      this.log.debug({
        msg: "Approving tokens",
        protocolName: this.metadata.protocolName,
        intentHash: parsedArgs._hash,
        adapterAddress: adapter.address,
      });

      await Promise.all(
        Object.entries(requiredAmountsByTarget).map(
          async ([target, requiredAmount]) => {
            const erc20 = Erc20__factory.connect(target, signer);

            const tx = await erc20.approve(adapter.address, requiredAmount);
            await tx.wait();
          },
        ),
      );

      return { data: { adapter }, success: true };
    } catch (error: any) {
      return {
        error: error.message ?? "Failed to prepare Eco Intent.",
        success: false,
      };
    }
  }

  protected async fill(
    parsedArgs: ParsedArgs,
    data: IntentData,
    originChainName: string,
  ) {
    this.log.info({
      msg: "Filling Intent",
      intent: `${this.metadata.protocolName}-${parsedArgs._hash}`,
    });

    const _chainId = parsedArgs._destinationChain.toString();

    const filler = this.multiProvider.getSigner(_chainId);
    const ecoAdapter = EcoAdapter__factory.connect(
      data.adapter.address,
      filler,
    );

    const claimantAddress =
      await this.multiProvider.getSignerAddress(originChainName);

    const { _targets, _data, _expiryTime, nonce, _hash, _prover } = parsedArgs;

    const value = await ecoAdapter.fetchFee(
      chainIds[originChainName],
      [_hash],
      [claimantAddress],
      _prover,
    );

    const tx = await ecoAdapter.fulfillHyperInstant(
      chainIds[originChainName],
      _targets,
      _data,
      _expiryTime,
      nonce,
      claimantAddress,
      _hash,
      _prover,
      { value },
    );

    const receipt = await tx.wait();

    this.log.info({
      msg: "Filled Intent",
      intent: `${this.metadata.protocolName}-${parsedArgs._hash}`,
      txDetails: receipt.transactionHash,
      txHash: receipt.transactionHash,
    });
  }

  settleOrder(parsedArgs: ParsedArgs, data: IntentData) {
    return withdrawRewards(
      parsedArgs,
      data.adapter.chainName,
      this.multiProvider,
      this.metadata.protocolName,
    );
  }
}

export const create = (multiProvider: MultiProvider) =>
  new EcoFiller(multiProvider).create();
