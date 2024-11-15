import type { Deferrable } from "@ethersproject/properties";
import type {
  Provider,
  TransactionRequest,
  TransactionResponse,
} from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";
import type { Result } from "@hyperlane-xyz/utils";

import { log } from "./logger.js";

export class SolverWallet extends Wallet {
  _nonceCache: { [chainId: string]: number } = {};

  connect(provider: Provider): SolverWallet {
    const signer = new SolverWallet(this, provider);
    signer.setNonceCache(this._nonceCache);
    return signer;
  }

  setNonceCache(cache: Record<string, number>) {
    this._nonceCache = cache;
  }

  setupNonceCache(
    chainIds: Array<string | number>,
    nonces: Array<Result<number>>,
  ) {
    chainIds.forEach((chainId, index) => {
      if (nonces[index].success) {
        this._nonceCache[chainId] = nonces[index].data;
      }
    });
  }

  async sendTransaction(
    transaction: Deferrable<TransactionRequest>,
  ): Promise<TransactionResponse> {
    if (transaction.nonce == null) {
      transaction.nonce = this._nonceCache[await this.getChainId()]++;
    }

    log.debug("transaction", transaction);

    return super.sendTransaction(transaction);
  }
}
