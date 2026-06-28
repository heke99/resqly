/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@resqly/web-kit",
    "@resqly/ui",
    "@resqly/types",
    "@resqly/white-label",
    "@resqly/database",
    "@resqly/rbac",
    "@resqly/utils",
  ],
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
