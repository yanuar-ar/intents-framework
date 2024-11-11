import { Wallet } from "@ethersproject/wallet";
import { chainMetadata } from "@hyperlane-xyz/registry";
import { MultiProvider } from "@hyperlane-xyz/sdk";
import {
  addressToBytes32,
  bytes32ToAddress,
  ensure0x,
  type Result,
} from "@hyperlane-xyz/utils";

import { MNEMONIC, PRIVATE_KEY } from "../../config.js";
import { Erc20__factory } from "../../typechain/factories/contracts/Erc20__factory.js";
import { Hyperlane7683__factory } from "../../typechain/factories/hyperlane7683/contracts/Hyperlane7683__factory.js";
import type {
  IntentData,
  OpenEventArgs,
  ResolvedCrossChainOrder,
} from "./types.js";
import {
  getChainIdsWithEnoughTokens,
  getMetadata,
  log,
  retrieveOriginInfo,
  retrieveTargetInfo,
  settleOrder,
} from "./utils.js";

export const create = () => {
  const { multiProvider, originSettler } = setup();

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

    log.info(
      `Intent Indexed: Hyperlane7683-${orderId}, ${origin.join(", ")}, ${target.join(", ")}`,
    );

    const result = await prepareIntent(orderId, resolvedOrder, multiProvider);

    if (!result.success) {
      log.error(
        "Failed to gather the information for the intent:",
        result.error,
      );
      return;
    }

    const { fillInstructions, maxSpent } = result.data;

    await fill(orderId, fillInstructions, maxSpent, multiProvider);

    await settleOrder(fillInstructions, orderId, multiProvider);
  };
};

function setup() {
  if (!PRIVATE_KEY && !MNEMONIC) {
    throw new Error("Either a private key or mnemonic must be provided");
  }

  const metadata = getMetadata();

  const multiProvider = new MultiProvider(chainMetadata);
  const wallet = PRIVATE_KEY
    ? new Wallet(ensure0x(PRIVATE_KEY))
    : Wallet.fromMnemonic(MNEMONIC!);
  multiProvider.setSharedSigner(wallet);

  return { multiProvider, ...metadata };
}

// We're assuming the filler will pay out of their own stock, but in reality they may have to
// produce the funds before executing each leg.
async function prepareIntent(
  orderId: string,
  resolvedOrder: ResolvedCrossChainOrder,
  multiProvider: MultiProvider,
): Promise<Result<IntentData>> {
  log.info(`Evaluating filling Intent: Hyperlane7683-${orderId}`);

  try {
    const chainIdsWithEnoughTokens = await getChainIdsWithEnoughTokens(
      resolvedOrder,
      multiProvider,
    );

    log.debug("Chain IDs with enough tokens:", chainIdsWithEnoughTokens);

    const fillInstructions = resolvedOrder.fillInstructions.filter(
      ({ destinationChainId }) =>
        chainIdsWithEnoughTokens.includes(destinationChainId.toString()),
    );
    log.debug("fillInstructions:", JSON.stringify(fillInstructions));

    const maxSpent = resolvedOrder.maxSpent.filter(({ chainId }) =>
      chainIdsWithEnoughTokens.includes(chainId.toString()),
    );
    log.debug("maxSpent:", JSON.stringify(maxSpent));

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
): Promise<void> {
  log.info(`Filling Intent: Hyperlane7683-${orderId}`);

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
        log.debug(`Approval Tx: ${baseUrl}/tx/${receipt.transactionHash}`);
      } else {
        log.debug("Approval Tx:", receipt.transactionHash);
      }

      log.debug(
        "Approved",
        amount.toString(),
        "of",
        token,
        "to",
        recipient,
        "on",
        _chainId,
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

        log.info(`Filled Intent: Hyperlane7683-${orderId}, info: ${txInfo}`);

        log.debug("Filled leg on", _chainId, "with data", originData);
      },
    ),
  );
}
