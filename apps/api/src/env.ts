import path from "node:path";
import { existsSync } from "node:fs";

/** Load the repo-root .env for local dev (Coolify injects real env vars in production). */
export function loadEnv() {
  for (const file of [path.resolve(process.cwd(), ".env"), path.resolve(__dirname, "../../../.env"), path.resolve(process.cwd(), "../../.env")]) {
    if (existsSync(file)) {
      try {
        process.loadEnvFile(file);
      } catch {
        // ignore malformed files; real env vars still apply
      }
      break;
    }
  }
}

export function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing environment variable ${name}`);
  }
  return v;
}

/** JSON can't serialise BigInt; money is integer paise well within Number.MAX_SAFE_INTEGER. */
export function patchBigIntJson() {
  (BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function (this: bigint) {
    return Number(this);
  };
}
