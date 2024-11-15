import fs from "node:fs";

import { Wallet } from "@ethersproject/wallet";
import { chainMetadata } from "@hyperlane-xyz/registry";
import { MultiProvider } from "@hyperlane-xyz/sdk";
import { ensure0x, Result } from "@hyperlane-xyz/utils";
import { parse } from "yaml";

import { MNEMONIC, PRIVATE_KEY } from "../config.js";
import { SolverWallet } from "../SolverWallet.js";

export function getMetadata<TMetadata>(dirname: string): TMetadata {
  const data = fs.readFileSync(`${dirname}/metadata.yaml`, "utf8");
  return parse(data);
}

export async function getMultiProvider() {
  if (!PRIVATE_KEY && !MNEMONIC) {
    throw new Error("Either a private key or mnemonic must be provided");
  }

  const multiProvider = new MultiProvider(chainMetadata);
  const wallet = (
    PRIVATE_KEY
      ? new SolverWallet(ensure0x(PRIVATE_KEY))
      : SolverWallet.fromMnemonic(MNEMONIC!)
  ) as SolverWallet;

  const chainIds = multiProvider.getKnownChainIds().filter(Number).map(Number);
  const nonces = await retrieveChainsNonce(chainIds, wallet, multiProvider);

  wallet.setupNonceCache(chainIds, nonces);

  multiProvider.setSharedSigner(wallet);

  return multiProvider;
}

async function retrieveChainsNonce(
  chainIds: Array<number>,
  wallet: Wallet,
  multiProvider: MultiProvider,
): Promise<Array<Result<number>>> {
  const nonces = await Promise.allSettled(
    chainIds.map(async (chainId) => {
      const provider = multiProvider.getProvider(chainId);
      return provider.getTransactionCount(wallet.address);
    }),
  );

  return nonces.map((result) => {
    if (result.status === "fulfilled") {
      return { success: true, data: result.value };
    } else {
      return { success: false, error: result.reason };
    }
  });
}
