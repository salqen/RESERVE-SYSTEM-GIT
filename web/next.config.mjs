/** @type {import('next').NextConfig} */
const nextConfig = {
  // typy zdieľané s backendom (@backend/* v tsconfig) sú type-only importy,
  // takže netreba transpilePackages – pri kompilácii sa vymažú
  reactStrictMode: true,
};

export default nextConfig;
