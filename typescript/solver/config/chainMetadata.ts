import { z } from "zod";

import { chainMetadata as defaultChainMetadata } from "@hyperlane-xyz/registry";

import { ChainMetadataSchema } from "@hyperlane-xyz/sdk";
import type { ChainMap, ChainMetadata } from "@hyperlane-xyz/sdk";

import { objMerge } from "@hyperlane-xyz/utils";

const customChainMetadata = {
  // Example custom configuration
  "basesepolia": {
    "rpcUrls": [
      {
        "http": "https://base-sepolia.g.alchemy.com/v2/BCvjOOp5Wnahm0pX7vnuJ5DHaZMk4Iv6"
      }
    ]
  }
};

const chainMetadata = objMerge<ChainMap<ChainMetadata>>(
  defaultChainMetadata,
  customChainMetadata,
  10,
  false,
);

z.record(z.string(), ChainMetadataSchema).parse(chainMetadata);

export { chainMetadata };
