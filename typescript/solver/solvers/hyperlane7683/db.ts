import { createClient, type Config } from "@libsql/client";

let clientConfig: Config = {
  url: "file:local.db",
};

const db = createClient(clientConfig);

const createTable = `
    CREATE TABLE IF NOT EXISTS indexedBlocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chainName TEXT NOT NULL ,
      blockNumber INTEGER,
      processedEvents INTEGER
    )
`;

const chainBlockIndex = `CREATE INDEX IF NOT EXISTS idx_chain_block ON indexedBlocks (chainName, blockNumber DESC)`;
const chainBlockUniqueIndex = `CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_chain_block_unq ON indexedBlocks (chainName, blockNumber)`;

await db.batch([createTable, chainBlockIndex, chainBlockUniqueIndex], "write");

export const getLastIndexedBlocks = async () => {
  const result = await db.execute(
  `SELECT ib.chainName, ib.blockNumber, ib.processedEvents
    FROM indexedBlocks ib
    JOIN (
      SELECT chainName, MAX(blockNumber) AS maxBlock
      FROM indexedBlocks
      GROUP BY chainName
  ) sub ON ib.chainName = sub.chainName AND ib.blockNumber = sub.maxBlock;
  `);

  return result.rows.reduce((acc, current) => {
    acc[current['chainName'] as string] = {
      blockNumber: current['blockNumber'] as number,
      processedEvents: current['processedEvents']  as number
    }

    return acc;
  }, {} as Record<string, {
    blockNumber: number;
    processedEvents: number;
  }>)
}

export const saveBlockNumber = (chainName: string, blockNumber: number) => {
  db.execute({
    sql: `INSERT INTO indexedBlocks (chainName, blockNumber, processedEvents)
    VALUES (:chainName, :blockNumber, 1)
    ON CONFLICT(chainName, blockNumber)
    DO UPDATE SET processedEvents = processedEvents + 1;`,
    args: {
      chainName,
      blockNumber
    },
  });
}

export default db;
