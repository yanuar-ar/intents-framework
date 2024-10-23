import { ethers } from "ethers";
import { MultiProvider } from "@hyperlane-xyz/sdk";
import { chainMetadata } from "@hyperlane-xyz/registry";

import type { Event } from "ethers";

const Output = "(bytes32 token, uint256 amount, bytes32 recipient, uint64 chainId)";
const FillInstruction = "(uint64 destinationChainId; bytes32 destinationSettler, bytes originData)";
const ResolvedCrossChainOrder = `(address user, uint64 originChainId, uint32 openDeadline, uint32 fillDeadline, ${Output}[] maxSpent, ${Output}[] minReceived, ${FillInstruction}[] fillInstructions)`

const ORIGIN_SETTLER_ABI = [
  `event Open(bytes32 indexed orderId, ${ResolvedCrossChainOrder} resolvedOrder)`,

  // "function openFor(GaslessCrossChainOrder calldata order, bytes calldata signature, bytes calldata originFillerData) external",
  // "function open(OnchainCrossChainOrder calldata order) external",
  // "function resolveFor(GaslessCrossChainOrder calldata order, bytes calldata originFillerData) external view returns (ResolvedCrossChainOrder memory)",
  // "function resolve(OnchainCrossChainOrder calldata order) external view returns (ResolvedCrossChainOrder memory)",
];

const DESTINATION_SETTLER_ABI = [
  "function fill(bytes32 orderId, bytes calldata originData, bytes calldata fillerData) external"
];

const multiProvider = new MultiProvider(chainMetadata);

const origin = new ethers.Contract(ethers.constants.AddressZero, ORIGIN_SETTLER_ABI, multiProvider.getProvider("ethereum"));

const wallet = ethers.Wallet.fromMnemonic("test test test");

origin.on(origin.filters.Open(), fill);

async function fill(log: Event) {
  const resolvedOrder = log.args!.resolvedOrder;
  const outputs = resolvedOrder.maxSpent;
  const inputs = resolvedOrder.minReceived;
  const fillInstructions = resolvedOrder.fillInstructions;

  // It's still not clear if there MUST be an input for every output, so maybe it doesn't make any
  // sense to think about it this way, but we somehow need decide whether exchanging `inputs` for
  // `outputs` is a good deal for us.
  await Promise.all(inputs.map(async (input: any, index: number): Promise<void> => {
    const output = outputs[index];
    console.log(input.token, input.amount, output.token, output.amount);
  }));

  // We're assuming the filler will pay out of their own stock, but in reality they may have to
  // produce the funds before executing each leg.
  await Promise.all(outputs.map(async (output: any): Promise<void> => {
    const filler = wallet.connect(multiProvider.getProvider(output.chainId));
    // Check filler has at least output.amount of output.token available for executing this leg.
    console.log(filler.address, output.token, output.amount);
  }));

  await Promise.all(outputs.map(async (output: any, index: number): Promise<void> => {
    const filler = wallet.connect(multiProvider.getProvider(output.chainId));

    const destinationSettler = fillInstructions[index].destinationSettler;
    const destination = new ethers.Contract(destinationSettler, DESTINATION_SETTLER_ABI, filler);

    const originData = fillInstructions[index].originData;
    // Depending on the implementation we may call `destination.fill` directly or call some other
    // contract that will produce the funds needed to execute this leg and then in turn call
    // `destination.fill`
    await destination.fill(log.args!.orderId, originData, "");
  }));
}
