import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";

function getFontSize(text: string): number {
  if (text.length > 120) return 44;
  if (text.length > 80) return 54;
  if (text.length > 50) return 64;
  return 72;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const hook = (searchParams.get("hook") || "Your Dream Home Awaits").slice(0, 180);
  const agent = (searchParams.get("agent") || "").slice(0, 80);
  const color = searchParams.get("color") || "#6366f1";

  const fontExtraBold = readFileSync(join(process.cwd(), "public/fonts/Montserrat-ExtraBold.ttf"));
  const fontSemiBold = readFileSync(join(process.cwd(), "public/fonts/Montserrat-SemiBold.ttf"));

  const fontSize = getFontSize(hook);

  return new ImageResponse(
    (
      <div
        style={{
          width: 1280,
          height: 720,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0a0f1e 0%, #111827 55%, #0a0f1e 100%)",
          padding: "100px 120px",
          position: "relative",
          fontFamily: "Montserrat",
        }}
      >
        {/* Top color bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 12,
            background: color,
            display: "flex",
          }}
        />

        {/* Hook text */}
        <div
          style={{
            fontSize,
            fontWeight: 800,
            color: "white",
            textAlign: "center",
            lineHeight: 1.2,
            maxWidth: 1040,
            letterSpacing: "-1px",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {hook}
        </div>

        {/* Divider line */}
        <div
          style={{
            marginTop: 36,
            width: 80,
            height: 4,
            borderRadius: 9999,
            background: color,
            display: "flex",
          }}
        />

        {/* Agent name */}
        {agent && (
          <div
            style={{
              position: "absolute",
              bottom: 52,
              fontSize: 26,
              fontWeight: 600,
              color: color,
              letterSpacing: "1px",
              display: "flex",
            }}
          >
            {agent}
          </div>
        )}

        {/* Bottom color bar */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 6,
            background: color,
            display: "flex",
          }}
        />

        {/* Real Estate label top-right */}
        <div
          style={{
            position: "absolute",
            top: 32,
            right: 48,
            fontSize: 13,
            fontWeight: 600,
            color: "rgba(255,255,255,0.25)",
            letterSpacing: "3px",
            display: "flex",
          }}
        >
          REAL ESTATE
        </div>
      </div>
    ),
    {
      width: 1280,
      height: 720,
      fonts: [
        { name: "Montserrat", data: fontExtraBold, weight: 800 },
        { name: "Montserrat", data: fontSemiBold, weight: 600 },
      ],
    }
  );
}
