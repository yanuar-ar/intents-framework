import type { Provider } from "@ethersproject/providers";
import { MultiProvider } from "@hyperlane-xyz/sdk";
import type { Contract, Signer } from "ethers";

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
      }>;
      protocolName: string;
    },
    private readonly log: Logger,
  ) {}

  create() {
    return (handler: (args: TParsedArgs, originChainName: string) => void) => {
      const multiProvider = new MultiProvider(chainMetadata);

      this.metadata.contracts.forEach(({ address, chainName }) => {
        const provider = multiProvider.getProvider(chainName);
        const contract = this.contractFactory.connect(address, provider);
        const filter = contract.filters[this.eventName]();

        const listener: TypedListener<TEvent> = (...args) => {
          handler(this.parseEventArgs(args), chainName);
        };

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

  protected abstract parseEventArgs(
    args: Parameters<TypedListener<TEvent>>,
  ): TParsedArgs;
}
