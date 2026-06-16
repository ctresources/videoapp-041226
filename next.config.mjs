import withPWA from "next-pwa";

const pwa = withPWA({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  buildExcludes: [/middleware-manifest\.json$/],
  // Videos require HTTP Range requests for seeking/streaming.
  // The service worker must not intercept these — use NetworkOnly so
  // the browser talks directly to the CDN and range headers are preserved.
  runtimeCaching: [
    {
      urlPattern: /\.mp4(\?|$)/i,
      handler: "NetworkOnly",
    },
    {
      urlPattern: /supabase\.co\/storage/i,
      handler: "NetworkOnly",
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["fluent-ffmpeg", "@ffmpeg-installer/ffmpeg", "unpdf", "sharp"],
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
    ],
  },
};

export default pwa(nextConfig);
