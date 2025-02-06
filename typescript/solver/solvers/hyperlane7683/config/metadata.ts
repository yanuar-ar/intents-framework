import {
  type Hyperlane7683Metadata,
  Hyperlane7683MetadataSchema,
} from "../types.js";

const metadata: Hyperlane7683Metadata = {
  protocolName: "Hyperlane7683",
  originSettlers: [
    // {
    //   address: "0x6d2175B89315A9EB6c7eA71fDE54Ac0f294aDC34",
    //   chainName: "optimismsepolia",
    //   initialBlock: 23140076
    // },
    // {
    //   address: "0x6d2175B89315A9EB6c7eA71fDE54Ac0f294aDC34",
    //   chainName: "arbitrumsepolia",
    //   initialBlock: 118764795
    // },
    // {
    //   address: "0x6d2175B89315A9EB6c7eA71fDE54Ac0f294aDC34",
    //   chainName: "sepolia",
    //   initialBlock: 7590000
    // },
    {
      address: "0x6d2175B89315A9EB6c7eA71fDE54Ac0f294aDC34",
      chainName: "basesepolia",
      initialBlock: 21491220,
    },
  ],
};

Hyperlane7683MetadataSchema.parse(metadata);

export default metadata;
