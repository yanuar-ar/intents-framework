import type { TypedListener } from "../../typechain/common.js";
import type {
  IntentCreatedEvent,
  IntentSource,
} from "../../typechain/eco/contracts/IntentSource.js";
import { IntentSource__factory } from "../../typechain/factories/eco/contracts/IntentSource__factory.js";
import { BaseListener } from "../BaseListener.js";
import { metadata } from "./config/index.js";
import type { ParsedArgs } from "./types.js";
import { log } from "./utils.js";

export class EcoListener extends BaseListener<
  IntentSource,
  IntentCreatedEvent,
  ParsedArgs
> {
  constructor() {
    const { intentSources, protocolName } = metadata;
    const ecoMetadata = { contracts: intentSources, protocolName };

    super(IntentSource__factory, "IntentCreated", ecoMetadata, log);
  }

  protected parseEventArgs([
    _hash,
    _creator,
    _destinationChain,
    _targets,
    _data,
    _rewardTokens,
    _rewardAmounts,
    _expiryTime,
    nonce,
    _prover,
  ]: Parameters<TypedListener<IntentCreatedEvent>>) {
    return {
      orderId: _hash,
      _hash,
      _creator,
      _destinationChain,
      _targets,
      _data,
      _rewardTokens,
      _rewardAmounts,
      _expiryTime,
      nonce,
      _prover,
    };
  }
}

export const create = () => new EcoListener().create();
