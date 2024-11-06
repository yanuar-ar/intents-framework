import { Wallet } from "@ethersproject/wallet";
import { chainMetadata } from "@hyperlane-xyz/registry";
import { MultiProvider } from "@hyperlane-xyz/sdk";
import { ensure0x, type Result } from "@hyperlane-xyz/utils";

import { Zero } from "@ethersproject/constants";

import { type BigNumber } from "ethers";
import {
  ECO_ADAPTER_ADDRESS,
  MNEMONIC,
  ORIGIN_SETTLER_CHAIN_ID,
  PRIVATE_KEY,
} from "../../config.js";
import { logDebug, logError, logGreen } from "../../logger.js";
import { IntentCreatedEventObject } from "../../typechain/eco/contracts/IntentSource.js";
import { Erc20__factory } from "../../typechain/factories/contracts/Erc20__factory.js";
import { EcoAdapter__factory } from "../../typechain/factories/eco/contracts/EcoAdapter__factory.js";

type IntentData = { [targetAddress: string]: BigNumber };

export const create = () => {
  const { ECO_ADAPTER_ADDRESS, multiProvider, ORIGIN_SETTLER_CHAIN_ID } =
    setup();

  return async function onChain(intent: IntentCreatedEventObject) {
    logGreen("Received Intent:", intent._hash);

    const result = await prepareIntent(intent, multiProvider);

    if (!result.success) {
      logError(
        "Failed to gather the information for the intent:",
        result.error,
      );
      return;
    }

    await fill(
      intent,
      ECO_ADAPTER_ADDRESS,
      ORIGIN_SETTLER_CHAIN_ID,
      multiProvider,
    );

    logGreen(`Fulfilled intent:`, intent._hash);
  };
};

function setup() {
  if (!PRIVATE_KEY && !MNEMONIC) {
    throw new Error("Either a private key or mnemonic must be provided");
  }

  if (!ECO_ADAPTER_ADDRESS) {
    throw new Error("Eco adapter address must be provided");
  }

  if (!ORIGIN_SETTLER_CHAIN_ID) {
    throw new Error("Origin settler chain ID must be provided");
  }

  const multiProvider = new MultiProvider(chainMetadata);
  const wallet = PRIVATE_KEY
    ? new Wallet(ensure0x(PRIVATE_KEY))
    : Wallet.fromMnemonic(MNEMONIC!);
  multiProvider.setSharedSigner(wallet);

  return { ECO_ADAPTER_ADDRESS, multiProvider, ORIGIN_SETTLER_CHAIN_ID };
}

// We're assuming the filler will pay out of their own stock, but in reality they may have to
// produce the funds before executing each leg.
async function prepareIntent(
  intent: IntentCreatedEventObject,
  multiProvider: MultiProvider,
): Promise<Result<IntentData>> {
  try {
    const provider = multiProvider.getProvider(
      intent._destinationChain.toString(),
    );
    const erc20Interface = Erc20__factory.createInterface();

    const requiredAmountsByTarget = intent._targets.reduce<IntentData>(
      (acc, target, index) => {
        const [, amount] = erc20Interface.decodeFunctionData(
          "transfer",
          intent._data[index],
        ) as [string, BigNumber];

        acc[target] ||= Zero;
        acc[target] = acc[target].add(amount);

        return acc;
      },
      {},
    );

    const fillerAddress = await multiProvider.getSignerAddress(
      intent._destinationChain.toString(),
    );

    const areTargetFundsAvailable = await Promise.all(
      Object.entries(requiredAmountsByTarget).map(
        async ([target, requiredAmount]) => {
          const erc20 = Erc20__factory.connect(target, provider);

          const balance = await erc20.balanceOf(fillerAddress);
          return balance.gte(requiredAmount);
        },
      ),
    );

    if (!areTargetFundsAvailable.every(Boolean)) {
      return { error: "Not enough tokens", success: false };
    }

    return { data: requiredAmountsByTarget, success: true };
  } catch (error: any) {
    return {
      error:
        error.message ?? "Failed find chain IDs with enough tokens to fill.",
      success: false,
    };
  }
}

async function fill(
  intent: IntentCreatedEventObject,
  adapterAddress: string,
  originChainId: string,
  multiProvider: MultiProvider,
): Promise<void> {
  logGreen("About to fulfill intent", intent._hash);
  const _chainId = intent._destinationChain.toString();

  const filler = multiProvider.getSigner(_chainId);
  const adapter = EcoAdapter__factory.connect(adapterAddress, filler);

  const claimant = multiProvider.getSigner(originChainId);
  const claimantAddress = await claimant.getAddress();

  const { _targets, _data, _expiryTime, nonce, _hash, _prover } = intent;
  const tx = await adapter.fulfillHyperInstant(
    originChainId,
    _targets,
    _data,
    _expiryTime,
    nonce,
    claimantAddress,
    _hash,
    _prover,
  );

  const receipt = await tx.wait();
  const baseUrl =
    multiProvider.getChainMetadata(_chainId).blockExplorers?.[0].url;

  if (baseUrl) {
    logGreen(`Fulfill Tx: ${baseUrl}/tx/${receipt.transactionHash}`);
  } else {
    logGreen("Fulfill Tx:", receipt.transactionHash);
  }

  logDebug("Fulfilled intent on", _chainId, "with data", _data);
}
