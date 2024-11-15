import { TypedListener } from "../../typechain/common.js";
import { Hyperlane7683__factory } from "../../typechain/factories/hyperlane7683/contracts/Hyperlane7683__factory.js";
import type {
  Hyperlane7683,
  OpenEvent,
} from "../../typechain/hyperlane7683/contracts/Hyperlane7683.js";
import { BaseListener } from "../BaseListener.js";
import { OpenEventArgs } from "./types.js";

import { getMetadata, log } from "./utils.js";

export class OnChainListener extends BaseListener<
  Hyperlane7683,
  OpenEvent,
  OpenEventArgs
> {
  constructor() {
    const {
      originSettler: { address, chainId },
      solverName,
    } = getMetadata();
    const metadata = { address, chainId, solverName };

    super(Hyperlane7683__factory, "Open", metadata, log);
  }

  protected override parseEventArgs(
    args: Parameters<TypedListener<OpenEvent>>,
  ) {
    const [orderId, resolvedOrder] = args;
    return { orderId, resolvedOrder };
  }
}

export const create = () => new OnChainListener().create();
