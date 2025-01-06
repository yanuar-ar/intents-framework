import { AddressZero } from "@ethersproject/constants";
import { type MultiProvider } from "@hyperlane-xyz/sdk";
import {
  addressToBytes32,
  bytes32ToAddress,
  type Result,
} from "@hyperlane-xyz/utils";

import { Erc20__factory } from "../../typechain/factories/contracts/Erc20__factory.js";
import { Hyperlane7683__factory } from "../../typechain/factories/hyperlane7683/contracts/Hyperlane7683__factory.js";
import type { IntentData, OpenEventArgs } from "./types.js";
import {
  getChainIdsWithEnoughTokens,
  log,
  retrieveOriginInfo,
  retrieveTargetInfo,
  settleOrder,
} from "./utils.js";

import { chainIdsToName, isAllowedIntent } from "../../config/index.js";
import { BaseFiller } from "../BaseFiller.js";
import { allowBlockLists, metadata } from "./config/index.js";

class Hyperlane7683Filler extends BaseFiller<
  { protocolName: string },
  OpenEventArgs,
  IntentData
> {
  constructor(multiProvider: MultiProvider) {
    const { protocolName } = metadata;
    const hyperlane7683FillerMetadata = { protocolName };

    super(multiProvider, hyperlane7683FillerMetadata, log);
  }

  protected async retrieveOriginInfo(parsedArgs: OpenEventArgs) {
    return retrieveOriginInfo(parsedArgs.resolvedOrder, this.multiProvider);
  }

  protected async retrieveTargetInfo(parsedArgs: OpenEventArgs) {
    return retrieveTargetInfo(parsedArgs.resolvedOrder, this.multiProvider);
  }

  protected async prepareIntent(
    parsedArgs: OpenEventArgs,
  ): Promise<Result<IntentData>> {
    this.log.info({
      msg: "Evaluating filling Intent",
      intent: `${this.metadata.protocolName}-${parsedArgs.orderId}`,
    });

    try {
      if (
        !parsedArgs.resolvedOrder.maxSpent.every((maxSpent) =>
          isAllowedIntent(allowBlockLists, {
            senderAddress: parsedArgs.resolvedOrder.user,
            destinationDomain: chainIdsToName[maxSpent.chainId.toString()],
            recipientAddress: maxSpent.recipient,
          }),
        )
      ) {
        return {
          error: "Not allowed intent",
          success: false,
        };
      }

      const chainIdsWithEnoughTokens = await getChainIdsWithEnoughTokens(
        parsedArgs.resolvedOrder,
        this.multiProvider,
      );

      this.log.debug({
        msg: "Chain IDs with enough tokens",
        protocolName: this.metadata.protocolName,
        chainIdsWithEnoughTokens,
      });

      const fillInstructions = parsedArgs.resolvedOrder.fillInstructions.filter(
        ({ destinationChainId }) =>
          chainIdsWithEnoughTokens.includes(destinationChainId.toString()),
      );

      this.log.debug({
        msg: "Fill instructions",
        protocolName: this.metadata.protocolName,
        fillInstructions: JSON.stringify(fillInstructions),
      });

      const maxSpent = parsedArgs.resolvedOrder.maxSpent.filter(({ chainId }) =>
        chainIdsWithEnoughTokens.includes(chainId.toString()),
      );

      this.log.debug({
        msg: "Max spent",
        protocolName: this.metadata.protocolName,
        maxSpent: JSON.stringify(maxSpent),
      });

      return { data: { fillInstructions, maxSpent }, success: true };
    } catch (error: any) {
      return {
        error:
          error.message ?? "Failed find chain IDs with enough tokens to fill.",
        success: false,
      };
    }
  }

  protected async fill(parsedArgs: OpenEventArgs, data: IntentData) {
    this.log.info({
      msg: "Filling Intent",
      intent: `${this.metadata.protocolName}-${parsedArgs.orderId}`,
    });

    await Promise.all(
      data.maxSpent.map(
        async ({ amount, chainId, recipient, token: tokenAddress }) => {
          tokenAddress = bytes32ToAddress(tokenAddress);
          recipient = bytes32ToAddress(recipient);
          const _chainId = chainId.toString();

          const filler = this.multiProvider.getSigner(_chainId);

          if (tokenAddress === AddressZero) {
            // native token
            return;
          }

          const tx = await Erc20__factory.connect(tokenAddress, filler).approve(
            recipient,
            amount,
          );

          const receipt = await tx.wait();
          const baseUrl =
            this.multiProvider.getChainMetadata(_chainId).blockExplorers?.[0]
              .url;

          if (baseUrl) {
            this.log.debug({
              msg: "Approval",
              protocolName: this.metadata.protocolName,
              tx: `${baseUrl}/tx/${receipt.transactionHash}`,
            });
          } else {
            this.log.debug({
              msg: "Approval",
              protocolName: this.metadata.protocolName,
              tx: `${receipt.transactionHash}`,
            });
          }

          this.log.debug({
            msg: "Approval",
            protocolName: this.metadata.protocolName,
            amount: amount.toString(),
            tokenAddress,
            recipient,
            chainId: _chainId,
          });
        },
      ),
    );

    await Promise.all(
      data.fillInstructions.map(
        async (
          { destinationChainId, destinationSettler, originData },
          index,
        ) => {
          destinationSettler = bytes32ToAddress(destinationSettler);
          const _chainId = destinationChainId.toString();

          const filler = this.multiProvider.getSigner(_chainId);
          const fillerAddress = await filler.getAddress();
          const destination = Hyperlane7683__factory.connect(
            destinationSettler,
            filler,
          );

          const value =
            bytes32ToAddress(data.maxSpent[index].token) === AddressZero
              ? data.maxSpent[index].amount
              : undefined;

          // Depending on the implementation we may call `destination.fill` directly or call some other
          // contract that will produce the funds needed to execute this leg and then in turn call
          // `destination.fill`
          const tx = await destination.fill(
            parsedArgs.orderId,
            originData,
            addressToBytes32(fillerAddress),
            { value },
          );

          const receipt = await tx.wait();
          const baseUrl =
            this.multiProvider.getChainMetadata(_chainId).blockExplorers?.[0]
              .url;

          const txInfo = baseUrl
            ? `${baseUrl}/tx/${receipt.transactionHash}`
            : receipt.transactionHash;

          log.info({
            msg: "Filled Intent",
            intent: `${this.metadata.protocolName}-${parsedArgs.orderId}`,
            txDetails: txInfo,
            txHash: receipt.transactionHash,
          });
        },
      ),
    );
  }

  settleOrder(parsedArgs: OpenEventArgs, data: IntentData) {
    return settleOrder(
      data.fillInstructions,
      parsedArgs.orderId,
      this.multiProvider,
      this.metadata.protocolName,
    );
  }
}

export const create = (multiProvider: MultiProvider) =>
  new Hyperlane7683Filler(multiProvider).create();
