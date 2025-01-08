import type { MultiProvider } from "@hyperlane-xyz/sdk";
import type { Result } from "@hyperlane-xyz/utils";
import type { Logger } from "../logger.js";

type Metadata = {
  protocolName: string;
};

type ParsedArgs = {
  orderId: string;
};

export abstract class BaseFiller<
  TMetadata extends Metadata,
  TParsedArgs extends ParsedArgs,
  TIntentData extends unknown,
> {
  protected constructor(
    readonly multiProvider: MultiProvider,
    readonly metadata: TMetadata,
    readonly log: Logger,
  ) {}

  create() {
    return async (parsedArgs: TParsedArgs, originChainName: string) => {
      const origin = await this.retrieveOriginInfo(parsedArgs, originChainName);
      const target = await this.retrieveTargetInfo(parsedArgs);

      this.log.info({
        msg: "Intent Indexed",
        intent: `${this.metadata.protocolName}-${parsedArgs.orderId}`,
        origin: origin.join(", "),
        target: target.join(", "),
      });

      const intent = await this.prepareIntent(parsedArgs);

      if (!intent.success) {
        this.log.error(`Failed evaluating filling Intent: ${intent.error}`);
        return;
      }

      const { data } = intent;

      await this.fill(parsedArgs, data, originChainName);

      await this.settleOrder(parsedArgs, data);
    };
  }

  protected abstract retrieveOriginInfo(
    parsedArgs: TParsedArgs,
    chainName: string,
  ): Promise<Array<string>>;

  protected abstract retrieveTargetInfo(
    parsedArgs: TParsedArgs,
  ): Promise<Array<string>>;

  protected abstract prepareIntent(
    parsedArgs: TParsedArgs,
  ): Promise<Result<TIntentData>>;

  protected abstract fill(
    parsedArgs: TParsedArgs,
    data: TIntentData,
    originChainName: string,
  ): Promise<void>;

  protected async settleOrder(parsedArgs: TParsedArgs, data: TIntentData) {
    return;
  }
}
