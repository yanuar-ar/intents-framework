import { chainMetadata } from "@hyperlane-xyz/registry";
import { MultiProvider } from "@hyperlane-xyz/sdk";
import { ensure0x } from "@hyperlane-xyz/utils";
import { password } from "@inquirer/prompts";
import { ethers } from "ethers";

import { MNEMONIC, PRIVATE_KEY } from "../config/index.js";
import { NonceKeeperWallet } from "../NonceKeeperWallet.js";

export async function getMultiProvider() {
  const multiProvider = new MultiProvider(chainMetadata);
  const wallet = await getSigner();

  multiProvider.setSharedSigner(wallet);

  return multiProvider;
}

export async function getSigner(): Promise<NonceKeeperWallet> {
  const key = await retrieveKey();
  const signer = privateKeyToSigner(key);
  return signer;
}

function privateKeyToSigner(key: string): NonceKeeperWallet {
  if (!key) throw new Error("No private key provided");

  const formattedKey = key.trim().toLowerCase();
  if (ethers.utils.isHexString(ensure0x(formattedKey)))
    return new NonceKeeperWallet(ensure0x(key)) as NonceKeeperWallet;
  else if (formattedKey.split(" ").length >= 6)
    return NonceKeeperWallet.fromMnemonic(formattedKey) as NonceKeeperWallet;
  else throw new Error("Invalid private key format");
}

async function retrieveKey(): Promise<string> {
  if (PRIVATE_KEY) {
    return PRIVATE_KEY;
  } else if (MNEMONIC) {
    return MNEMONIC;
  } else
    return password({
      message: `Please enter private key or mnemonic.`,
    });
}
