import dotenvFlow from "dotenv-flow";

dotenvFlow.config();

const ECO_ADAPTER_ADDRESS = process.env.ECO_ADAPTER_ADDRESS;
const MNEMONIC = process.env.MNEMONIC;
const ORIGIN_SETTLER_ADDRESS = process.env.ORIGIN_SETTLER_ADDRESS;
const ORIGIN_SETTLER_CHAIN_ID = process.env.ORIGIN_SETTLER_CHAIN_ID;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

export {
  ECO_ADAPTER_ADDRESS,
  MNEMONIC,
  ORIGIN_SETTLER_ADDRESS,
  ORIGIN_SETTLER_CHAIN_ID,
  PRIVATE_KEY,
};
