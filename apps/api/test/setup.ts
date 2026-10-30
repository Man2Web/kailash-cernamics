import "reflect-metadata";
import path from "node:path";

try {
  process.loadEnvFile(path.resolve(__dirname, "../../../.env"));
} catch {
  /* CI provides env */
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = "test";
process.env.LOGIN_RATE_LIMIT = "10000";
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function (this: bigint) {
  return Number(this);
};
