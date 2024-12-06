import dotenvFlow from "dotenv-flow";
import allowBlockListsGlobal from "./allowBlockLists.js";

dotenvFlow.config();

const LOG_FORMAT = process.env.LOG_FORMAT;
const LOG_LEVEL = process.env.LOG_LEVEL;
const MNEMONIC = process.env.MNEMONIC;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

export { LOG_FORMAT, LOG_LEVEL, MNEMONIC, PRIVATE_KEY, allowBlockListsGlobal };

type GenericAllowBlockListItem = {
  [key: string]: string[] | "*";
};

type GenericAllowBlockLists = {
  allowList: GenericAllowBlockListItem[];
  blockList: GenericAllowBlockListItem[];
};

type Item = {
  [Key in keyof GenericAllowBlockListItem]: string;
};

const matches = (item: GenericAllowBlockListItem, data: Item): boolean => {
  const matches = Object.keys(item).map((key) => {
    return item[key as keyof GenericAllowBlockListItem] === "*" || item[key as keyof GenericAllowBlockListItem].includes(data[key as keyof GenericAllowBlockListItem])
  })

  return matches.every((el: boolean) => el)
};

export function isAllowedIntent(
  allowBlockLists: GenericAllowBlockLists,
  transaction: Item
): boolean {
  // Check blockList first
  const isBlocked = allowBlockLists.blockList.some((blockItem) =>
    matches(blockItem, transaction)
  ) || allowBlockListsGlobal.blockList.some((blockItem) =>
    matches(blockItem, transaction)
  );
  if (isBlocked) return false;

  // Check allowList
  const isAllowed = allowBlockLists.allowList.some((allowItem) =>
    matches(allowItem, transaction)
  ) || allowBlockLists.allowList.some((allowItem) =>
    matches(allowItem, transaction)
  );

  return isAllowed;
}
