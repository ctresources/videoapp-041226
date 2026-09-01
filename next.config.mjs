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
      // Same reason, for the route that actually renders reels: without the
      // binary named here it is traced away and every render fails at the
      // first frame.
      // public/fonts, not fonts: the thumbnail routes above use the Anton and
      // Archivo files in ./fonts, and the renderer uses the Montserrat ones in
      // ./public/fonts. Naming the wrong directory shipped the binary and left
      // the typeface behind, and drawtext then failed the whole render.
      // Both font directories: the Montserrat weights in public/fonts are the
      // preference, and ./fonts holds the Archivo and Anton files the renderer
      // falls back to when one of those turns out not to be a font.
      "/api/video/photo-reel": [
        "./node_modules/@ffmpeg-installer/**",
        "./public/fonts/**",
        "./fonts/**",
      ],
    },
  },
  images: {
    remotePatterns: [
      // One entry, not two. The first used to name gfawbvsokbgrlbcfqrkh —
      // a project this app no longer uses; its storage is on
      // fifryrqhrfnzbwpvvvkz. It had been dead for a while and nobody could
      // tell, because the wildcard below it was quietly matching everything
      // the named host was supposed to. Two rules where one has stopped
      // working is worse than one rule: it reads as deliberate, so the day
      // the wildcard is narrowed for a good reason, images break and the
      // stale line is the last place anyone looks.
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
