import dotenvFlow from "dotenv-flow";

dotenvFlow.config();

const MNEMONIC = process.env.MNEMONIC;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

export { MNEMONIC, PRIVATE_KEY };
