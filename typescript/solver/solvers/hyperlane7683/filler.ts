import { type MultiProvider } from "@hyperlane-xyz/sdk";
import {
  addressToBytes32,
  bytes32ToAddress,
  type Result,
} from "@hyperlane-xyz/utils";

import { Erc20__factory } from "../../typechain/factories/contracts/Erc20__factory.js";
import { Hyperlane7683__factory } from "../../typechain/factories/hyperlane7683/contracts/Hyperlane7683__factory.js";
import type {
  IntentData,
  OpenEventArgs,
  ResolvedCrossChainOrder,
} from "./types.js";
import {
  getChainIdsWithEnoughTokens,
  log,
  retrieveOriginInfo,
  retrieveTargetInfo,
  settleOrder,
} from "./utils.js";

import { metadata } from "./config/index.js";

export const create = (multiProvider: MultiProvider) => {
  const { originSettler, solverName } = setup();

  return async function hyperlane7683({
    orderId,
    resolvedOrder,
  }: OpenEventArgs) {
    const origin = await retrieveOriginInfo(
      resolvedOrder,
      originSettler,
      multiProvider,
    );
    const target = await retrieveTargetInfo(resolvedOrder, multiProvider);

    log.info({
      msg: "Intent Indexed",
      intent: `${solverName}-${orderId}`,
      origin: origin.join(", "),
      target: target.join(", "),
    });

    const result = await prepareIntent(
      orderId,
      resolvedOrder,
      multiProvider,
      solverName,
    );

    if (!result.success) {
      log.error(
        `${solverName} Failed evaluating filling Intent: ${result.error}`,
      );
      return;
    }

    const { fillInstructions, maxSpent } = result.data;

    await fill(orderId, fillInstructions, maxSpent, multiProvider, solverName);

    await settleOrder(fillInstructions, orderId, multiProvider, solverName);
  };
};

function setup() {
  if (!metadata.solverName) {
    metadata.solverName = "UNKNOWN_SOLVER";
  }

  if (!metadata.originSettler.chainId) {
    throw new Error("OriginSettler chain ID must be provided");
  }

  if (!metadata.originSettler.address) {
    throw new Error("OriginSettler address must be provided");
  }

  return metadata;
}

// We're assuming the filler will pay out of their own stock, but in reality they may have to
// produce the funds before executing each leg.
async function prepareIntent(
  orderId: string,
  resolvedOrder: ResolvedCrossChainOrder,
  multiProvider: MultiProvider,
  solverName: string,
): Promise<Result<IntentData>> {
  log.info({
    msg: "Evaluating filling Intent",
    intent: `${solverName}-${orderId}`,
  });

  try {
    const chainIdsWithEnoughTokens = await getChainIdsWithEnoughTokens(
      resolvedOrder,
      multiProvider,
    );

    log.debug(
      `${solverName} - Chain IDs with enough tokens: ${chainIdsWithEnoughTokens}`,
    );

    const fillInstructions = resolvedOrder.fillInstructions.filter(
      ({ destinationChainId }) =>
        chainIdsWithEnoughTokens.includes(destinationChainId.toString()),
    );
    log.debug(
      `${solverName} - fillInstructions: ${JSON.stringify(fillInstructions)}`,
    );

    const maxSpent = resolvedOrder.maxSpent.filter(({ chainId }) =>
      chainIdsWithEnoughTokens.includes(chainId.toString()),
    );
    log.debug(`${solverName} - maxSpent: ${JSON.stringify(maxSpent)}`);

    return { data: { fillInstructions, maxSpent }, success: true };
  } catch (error: any) {
    return {
      error:
        error.message ?? "Failed find chain IDs with enough tokens to fill.",
      success: false,
    };
  }
}

async function fill(
  orderId: string,
  fillInstructions: ResolvedCrossChainOrder["fillInstructions"],
  maxSpent: ResolvedCrossChainOrder["maxSpent"],
  multiProvider: MultiProvider,
  solverName: string,
): Promise<void> {
  log.info({
    msg: "Filling Intent",
    intent: `${solverName}-${orderId}`,
  });

  await Promise.all(
    maxSpent.map(async ({ chainId, token, amount, recipient }) => {
      token = bytes32ToAddress(token);
      recipient = bytes32ToAddress(recipient);
      const _chainId = chainId.toString();

      const filler = multiProvider.getSigner(_chainId);
      const tx = await Erc20__factory.connect(token, filler).approve(
        recipient,
        amount,
      );

      const receipt = await tx.wait();
      const baseUrl =
        multiProvider.getChainMetadata(_chainId).blockExplorers?.[0].url;

      if (baseUrl) {
        log.debug(
          `${solverName} - Approval Tx: ${baseUrl}/tx/${receipt.transactionHash}`,
        );
      } else {
        log.debug(`${solverName} - Approval Tx: ${receipt.transactionHash}`);
      }

      log.debug(
        `${solverName} - Approved ${amount.toString()} of ${token} to ${recipient} on ${_chainId}`,
      );
    }),
  );

  await Promise.all(
    fillInstructions.map(
      async ({ destinationChainId, destinationSettler, originData }) => {
        destinationSettler = bytes32ToAddress(destinationSettler);
        const _chainId = destinationChainId.toString();

        const filler = multiProvider.getSigner(_chainId);
        const fillerAddress = await filler.getAddress();
        const destination = Hyperlane7683__factory.connect(
          destinationSettler,
          filler,
        );

        // Depending on the implementation we may call `destination.fill` directly or call some other
        // contract that will produce the funds needed to execute this leg and then in turn call
        // `destination.fill`
        const tx = await destination.fill(
          orderId,
          originData,
          addressToBytes32(fillerAddress),
        );

        const receipt = await tx.wait();
        const baseUrl =
          multiProvider.getChainMetadata(_chainId).blockExplorers?.[0].url;

        const txInfo = baseUrl
          ? `${baseUrl}/tx/${receipt.transactionHash}`
          : receipt.transactionHash;

        log.info({
          msg: "Filled Intent",
          intent: `${solverName}-${orderId}`,
          txDetails: txInfo,
          txHash: receipt.transactionHash,
        });
      },
    ),
  );
}
