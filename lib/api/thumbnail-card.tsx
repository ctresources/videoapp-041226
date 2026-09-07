import { ImageResponse } from "next/og";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * The generated YouTube thumbnail card — hook, name, colour bars.
 *
 * Lifted out of app/api/thumbnail so it has two callers instead of one. The
 * route below it serves this to a signed-in browser; the publish path renders
 * the same bytes in-process and hands them straight to YouTube.
 *
 * That second caller is the point. Publishing used to fetch the thumbnail over
 * HTTP from our own server, which cannot work once the route requires a signed
 * in owner — there are no cookies on a server-to-server fetch. Rendering in
 * process removes the round trip along with the problem.
 */

export const THUMB_W = 1280;
export const THUMB_H = 720;

/** The default accent. There is no brand colour on the profile yet; when there
 *  is, it belongs here and nowhere else. */
export const THUMB_DEFAULT_COLOR = "#6366f1";

export const THUMB_FALLBACK_HOOK = "Your Dream Home Awaits";

function getFontSize(text: string): number {
  if (text.length > 120) return 44;
  if (text.length > 80) return 54;
  if (text.length > 50) return 64;
  return 72;
}

export interface ThumbnailCardInput {
  hook?: string | null;
  agent?: string | null;
  color?: string | null;
}

/**
 * Clamped here rather than at each call site.
 *
 * The lengths are the same ones the route used to apply to its query string.
 * They now guard the database read too — a hook is free text and a very long
 * one would render off the canvas rather than wrap.
 */
function clean(input: ThumbnailCardInput) {
  return {
    hook: (input.hook || THUMB_FALLBACK_HOOK).slice(0, 180),
    agent: (input.agent || "").slice(0, 80),
    // Only the shapes a CSS colour can legitimately take here. The value
    // reaches an inline style, and this one is no longer copied from a query
    // string, but the check costs nothing and keeps it that way.
    color: /^#[0-9a-fA-F]{3,8}$/.test(input.color || "")
      ? (input.color as string)
      : THUMB_DEFAULT_COLOR,
  };
}

export function renderThumbnailCard(input: ThumbnailCardInput): ImageResponse {
  const { hook, agent, color } = clean(input);

  const fontExtraBold = readFileSync(join(process.cwd(), "public/fonts/Montserrat-ExtraBold.ttf"));
  const fontSemiBold = readFileSync(join(process.cwd(), "public/fonts/Montserrat-SemiBold.ttf"));

  const fontSize = getFontSize(hook);

  return new ImageResponse(
    (
      <div
        style={{
          width: THUMB_W,
          height: THUMB_H,
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
      width: THUMB_W,
      height: THUMB_H,
      fonts: [
        { name: "Montserrat", data: fontExtraBold, weight: 800 },
        { name: "Montserrat", data: fontSemiBold, weight: 600 },
      ],
    }
  );
}

/** The same card as raw PNG bytes, for handing to an upload rather than a
 *  browser. ImageResponse is a Response, so the body is already there. */
export async function thumbnailCardPng(input: ThumbnailCardInput): Promise<ArrayBuffer> {
  return await renderThumbnailCard(input).arrayBuffer();
}
