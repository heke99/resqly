/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@roadside/web-kit",
    "@roadside/ui",
    "@roadside/types",
    "@roadside/white-label",
    "@roadside/database",
    "@roadside/utils",
  ],
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
