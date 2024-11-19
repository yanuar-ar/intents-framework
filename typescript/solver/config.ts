import dotenvFlow from "dotenv-flow";

dotenvFlow.config();

const LOG_FORMAT = process.env.LOG_FORMAT;
const LOG_LEVEL = process.env.LOG_LEVEL;
const MNEMONIC = process.env.MNEMONIC;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

export { LOG_FORMAT, LOG_LEVEL, MNEMONIC, PRIVATE_KEY };
