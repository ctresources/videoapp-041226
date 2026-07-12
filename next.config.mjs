/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["fluent-ffmpeg", "@ffmpeg-installer/ffmpeg", "unpdf", "sharp"],
    // Thumbnail text is drawn from this bundled font (serverless has no system
    // fonts) — make sure the file ships with every route that renders one.
    outputFileTracingIncludes: {
      "/api/tools/thumbnail": ["./fonts/**"],
      "/api/video/webhook": ["./fonts/**"],
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "gfawbvsokbgrlbcfqrkh.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
