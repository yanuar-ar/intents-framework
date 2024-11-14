import fs from "node:fs";
import { parse } from "yaml";

export function getMetadata<TMetadata>(dirname: string): TMetadata {
  const data = fs.readFileSync(`${dirname}/metadata.yaml`, "utf8");
  return parse(data);
}
