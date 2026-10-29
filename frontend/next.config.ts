import type { NextConfig } from "next";
const apiOrigin = process.env.BERN_API_ORIGIN ?? "http://127.0.0.1:4400";
const config: NextConfig = {
  reactStrictMode: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/:path*` }];
  },
};
export default config;
