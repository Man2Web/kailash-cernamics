import type { NextConfig } from "next";

// Environment-specific hosts come from env vars (comma-separated, host or host:port), never from source.
const list = (value?: string) =>
  (value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const devOrigins = ["localhost", "127.0.0.1", ...list(process.env.DEV_ALLOWED_ORIGINS)];
const serverActionOrigins = ["localhost:3000", "127.0.0.1:3000", ...list(process.env.SERVER_ACTION_ALLOWED_ORIGINS)];

if (process.env.NODE_ENV === "production" && list(process.env.SERVER_ACTION_ALLOWED_ORIGINS).length === 0) {
  console.warn(
    "[next.config] SERVER_ACTION_ALLOWED_ORIGINS is not set: Server Actions are only accepted from same-origin requests " +
      "plus localhost. Set it to your public host(s) if you use a proxy or custom domain."
  );
}

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins,
  experimental: {
    serverActions: {
      allowedOrigins: serverActionOrigins,
    },
  },
};

export default nextConfig;
