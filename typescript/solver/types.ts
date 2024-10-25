import type { Event } from "@ethersproject/contracts";
import type { ChainId } from "@hyperlane-xyz/utils";
import { BigNumber } from "ethers";
import { OpenEventObject } from "./contracts/typechain/OriginSettler";

export type ExtractStruct<T, K extends object> = T extends (infer U & K)[]
  ? U[]
  : never;

export interface Output {
  token: string;
  amount: string;
  recipient: string;
  chainId: string;
}

export interface FillInstruction {
  destinationChainId: string;
  destinationSettler: string;
  originData: string;
}

export type ResolvedCrossChainOrder = Omit<
  OpenEventObject["resolvedOrder"],
  "minReceived" | "maxSpent" | "fillInstructions"
> & {
  minReceived: ExtractStruct<
    OpenEventObject["resolvedOrder"]["minReceived"],
    { token: string }
  >;
  maxSpent: ExtractStruct<
    OpenEventObject["resolvedOrder"]["maxSpent"],
    { token: string }
  >;
  fillInstructions: ExtractStruct<
    OpenEventObject["resolvedOrder"]["fillInstructions"],
    { destinationChainId: BigNumber }
  >;
};

export interface OpenEventArgs {
  orderId: string;
  resolvedOrder: ResolvedCrossChainOrder;
}

export interface OpenEvent extends Omit<Event, "args"> {
  args: OpenEventArgs;
}

export type OriginSettlerInfo = {
  address: string;
  chainId: ChainId;
};
