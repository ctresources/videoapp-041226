/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["fluent-ffmpeg", "@ffmpeg-installer/ffmpeg", "unpdf", "sharp", "opentype.js"],
    // Thumbnail text is drawn from this bundled font (serverless has no system
    // fonts) — make sure the file ships with every route that renders one.
    outputFileTracingIncludes: {
      "/api/tools/thumbnail": ["./fonts/**"],
      "/api/video/webhook": ["./fonts/**"],
      // The FFmpeg binary is resolved from inside node_modules at runtime,
      // which is the shape of dependency Next's tracing is worst at following
      // — so it is named explicitly rather than hoped for. Without this the
      // probe below cannot tell "FFmpeg does not work on this host" from
      // "the binary was never packaged", and those have opposite answers.
      "/api/video/ffmpeg-probe": ["./node_modules/@ffmpeg-installer/**"],
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
