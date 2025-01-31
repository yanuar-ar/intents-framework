import type { Provider } from "@ethersproject/providers";
import { MultiProvider } from "@hyperlane-xyz/sdk";
import type { Contract, EventFilter, Signer } from "ethers";

import { chainMetadata } from "../config/chainMetadata.js";
import type { Logger } from "../logger.js";
import type { TypedEvent, TypedListener } from "../typechain/common.js";

export abstract class BaseListener<
  TContract extends Contract,
  TEvent extends TypedEvent,
  TParsedArgs,
> {
  protected constructor(
    private readonly contractFactory: {
      connect(address: string, signerOrProvider: Signer | Provider): TContract;
    },
    private readonly eventName: Extract<keyof TContract["filters"], string>,
    private readonly metadata: {
      contracts: Array<{
        address: string;
        chainName: string;
        initialBlock: number;
        processedEvents?: number;
      }>;
      protocolName: string;
    },
    private readonly log: Logger,
  ) {}

  create() {
    return async (handler: (args: TParsedArgs, originChainName: string, blockNumber: number) => void) => {
      const multiProvider = new MultiProvider(chainMetadata);

      this.metadata.contracts.forEach(async ({ address, chainName, initialBlock, processedEvents }) => {
        const provider = multiProvider.getProvider(chainName);
        const contract = this.contractFactory.connect(address, provider);
        const filter = contract.filters[this.eventName]();

        const listener: TypedListener<TEvent> = (...args) => {
          handler(this.parseEventArgs(args), chainName, args[args.length - 1].blockNumber);
        };

        const latest = (await provider.getBlockNumber()) - 1;
        if (latest > initialBlock) {
          this.processPrevBlocks(chainName, contract, filter, initialBlock, latest, handler, processedEvents)
        }

        contract.on(filter, listener);

        contract.provider.getNetwork().then((network) => {
          this.log.info({
            msg: "Listener started",
            event: this.eventName,
            protocol: this.metadata.protocolName,
            chainId: network.chainId,
            chainName: chainName,
          });
        });
      });
    };
  }

  protected async processPrevBlocks(
    chainName: string,
    contract: TContract,
    filter: EventFilter,
    from: number,
    to: number,
    handler: (args: TParsedArgs, originChainName: string, blockNumber: number) => void,
    processedEvents?: number,
  ) {
    const pastEvents = await contract.queryFilter(filter, from, to)
        const sliceStart = processedEvents && pastEvents.length >= processedEvents ? processedEvents : 0;

        pastEvents.slice(sliceStart).forEach(async (e) => {
          handler(this.parseEventArgs((e as TEvent).args), chainName, e.blockNumber);
        })
  }

  protected abstract parseEventArgs(
    args: Parameters<TypedListener<TEvent>>,
  ): TParsedArgs;
}
