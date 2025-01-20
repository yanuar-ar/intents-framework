import {
  type Hyperlane7683Metadata,
  Hyperlane7683MetadataSchema,
} from "../types.js";

const metadata: Hyperlane7683Metadata = {
  protocolName: "Hyperlane7683",
  originSettlers: [
    {
      address: "0xe0c8f83bA0686FDF1a76AF0cC202181AEaA25a03",
      chainName: "optimismsepolia",
    },
    {
      address: "0xe0c8f83bA0686FDF1a76AF0cC202181AEaA25a03",
      chainName: "arbitrumsepolia",
    },
    {
      address: "0xe0c8f83bA0686FDF1a76AF0cC202181AEaA25a03",
      chainName: "sepolia",
    },
    {
      address: "0xe0c8f83bA0686FDF1a76AF0cC202181AEaA25a03",
      chainName: "basesepolia",
    },
  ],
};

Hyperlane7683MetadataSchema.parse(metadata);

export default metadata;
