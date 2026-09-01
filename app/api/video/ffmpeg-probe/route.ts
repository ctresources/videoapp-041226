/**
 * GET /api/video/ffmpeg-probe
 *
 * Does FFmpeg actually run in production?
 *
 * lib/api/ffmpeg-render.ts holds a complete Ken Burns slideshow renderer that
 * nothing calls. Whether that is worth wiring up or worth deleting turns on one
 * unknown: the module depends on a ~70 MB native binary that has to survive
 * Next's file tracing, land in the function bundle, and be executable in a
 * read-only serverless filesystem. That either works or it doesn't, and no
 * amount of reading the code settles it.
 *
 * So this walks the failure modes apart rather than reporting one pass/fail:
 * a binary missing from the bundle, a binary that will not execute, and a
 * binary that runs but cannot complete the filter chain the slideshow needs
 * are three different problems with three different answers.
 *
 * Deliberately not part of /api/video/test-render: that endpoint takes no
 * authentication, and encoding video is expensive enough that it should not be
 * reachable by anyone who knows the URL.
 */
import { createClient } from "@/lib/supabase/server";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

ffmpeg.setFfmpegPath(ffmpegPath.path);

/** Runs ffmpeg and resolves either way, so one failed step still reports. */
function run(build: (cmd: ffmpeg.FfmpegCommand) => ffmpeg.FfmpegCommand, out: string) {
  return new Promise<{ ok: boolean; detail: string }>((resolve) => {
    const started = Date.now();
    build(ffmpeg())
      .on("end", () => resolve({ ok: true, detail: `${Date.now() - started} ms` }))
      .on("error", (err: Error) =>
        resolve({ ok: false, detail: `${err.message.split("\n").slice(-3).join(" ").slice(0, 300)}` }),
      )
      .save(out);
  });
}

export async function GET() {
  // Any signed-in user, not just an admin: this reports on the deployment
  // rather than on anyone's data, and the point is being able to run it.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const results: Record<string, string> = {};
  results["environment"] = process.env.VERCEL
    ? `Vercel · ${process.env.VERCEL_ENV ?? "unknown env"} · ${process.env.VERCEL_REGION ?? "unknown region"}`
    : "Not Vercel (local or other host)";
  results["node"] = process.version;
  results["binary_path"] = ffmpegPath.path || "❌ empty";

  // ── 1. Is the binary in the bundle at all? ────────────────────────────────
  // The likeliest failure by far. The path is resolved at runtime from inside
  // node_modules, which is exactly the shape of import Next's file tracing is
  // worst at following.
  let binaryPresent = false;
  try {
    const stat = await fs.stat(ffmpegPath.path);
    binaryPresent = true;
    results["step1_binary_exists"] = `✅ Present — ${(stat.size / 1024 / 1024).toFixed(1)} MB`;
  } catch (e) {
    results["step1_binary_exists"] =
      `❌ MISSING: ${e instanceof Error ? e.message : String(e)} — ` +
      `the binary did not ship with this function. Fixable with outputFileTracingIncludes.`;
  }

  // ── 2. Can it be written to and executed from? ────────────────────────────
  const dir = join(tmpdir(), `ffprobe-${randomUUID()}`);
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(join(dir, "touch"), "x");
    results["step2_tmp_writable"] = `✅ OK — ${dir}`;
  } catch (e) {
    results["step2_tmp_writable"] = `❌ FAILED: ${e instanceof Error ? e.message : String(e)}`;
  }

  if (binaryPresent) {
    // ── 3. Does it execute? ─────────────────────────────────────────────────
    // A bundled binary can still be the wrong architecture, or land without the
    // execute bit — which reads as a completely different problem from step 1.
    const version = await new Promise<string>((resolve) => {
      ffmpeg.getAvailableFormats((err, formats) => {
        if (err) return resolve(`❌ WILL NOT RUN: ${err.message.slice(0, 200)}`);
        resolve(`✅ OK — ${Object.keys(formats ?? {}).length} formats available`);
      });
    });
    results["step3_executes"] = version;

    // ── 4. A trivial encode ─────────────────────────────────────────────────
    // Synthesised, so nothing is downloaded and only the encoder is measured.
    const plain = join(dir, "plain.mp4");
    const r1 = await run(
      (cmd) => cmd
        .input("color=c=black:s=320x180:d=1")
        .inputFormat("lavfi")
        .outputOptions(["-pix_fmt yuv420p", "-t 1"]),
      plain,
    );
    results["step4_basic_encode"] = r1.ok
      ? `✅ OK — ${r1.detail}`
      : `❌ FAILED: ${r1.detail}`;

    /**
     * ── 5–7. The filters the slideshow actually needs ─────────────────────
     *
     * Split three ways because the first attempt failed with "Error
     * initializing complex filters. Invalid argument", and that is a syntax
     * complaint rather than a missing filter — FFmpeg says "No such filter"
     * when a filter is genuinely absent. So the question is no longer whether
     * zoompan and xfade exist, it is which part of the argument they refused.
     *
     * The prime suspect is quoting. In a shell you write
     * z='min(zoom+0.0015,1.2)' so the shell strips the quotes and the comma
     * survives. fluent-ffmpeg spawns the binary directly, with no shell, so
     * those quotes arrive as literal characters inside the expression and the
     * comma still reads as a filter separator. A comma escaped with a
     * backslash and no quotes at all is the form that works unshelled.
     *
     * That matters well beyond this probe: ffmpeg-render.ts writes its zoompan
     * expressions in exactly the quoted shell form, which would make this the
     * reason a finished renderer has never had a caller.
     */
    const zpPlain = join(dir, "zp-plain.mp4");
    const r5 = await run(
      (cmd) => cmd
        .input("color=c=blue:s=640x360:d=2")
        .inputFormat("lavfi")
        // Constant zoom: no expression, no comma, nothing to quote. If this
        // fails the filter itself is missing from the build.
        .complexFilter(["[0:v]zoompan=z=1.1:d=50:s=640x360[out]"], "out")
        .outputOptions(["-pix_fmt yuv420p", "-t 2"]),
      zpPlain,
    );
    results["step5_zoompan_exists"] = r5.ok ? `✅ OK — ${r5.detail}` : `❌ FAILED: ${r5.detail}`;

    const zpExpr = join(dir, "zp-expr.mp4");
    const r6 = await run(
      (cmd) => cmd
        .input("color=c=blue:s=640x360:d=2")
        .inputFormat("lavfi")
        // The real Ken Burns move: an expression with a comma in it, escaped
        // rather than quoted. This is the line that decides whether
        // ffmpeg-render.ts needs rewriting or merely wiring up.
        .complexFilter(
          ["[0:v]zoompan=z=min(zoom+0.0015\\,1.2):d=50:s=640x360[out]"],
          "out",
        )
        .outputOptions(["-pix_fmt yuv420p", "-t 2"]),
      zpExpr,
    );
    results["step6_zoompan_expression"] = r6.ok ? `✅ OK — ${r6.detail}` : `❌ FAILED: ${r6.detail}`;

    const xf = join(dir, "xfade.mp4");
    const r7 = await run(
      (cmd) => cmd
        .input("color=c=blue:s=640x360:d=2")
        .inputFormat("lavfi")
        .input("color=c=red:s=640x360:d=2")
        .inputFormat("lavfi")
        .complexFilter(
          ["[0:v][1:v]xfade=transition=fade:duration=0.5:offset=1.5[out]"],
          "out",
        )
        .outputOptions(["-pix_fmt yuv420p", "-t 3"]),
      xf,
    );
    results["step7_xfade"] = r7.ok ? `✅ OK — ${r7.detail}` : `❌ FAILED: ${r7.detail}`;

    if (r7.ok) {
      try {
        const stat = await fs.stat(xf);
        results["step7_output_size"] = `${(stat.size / 1024).toFixed(0)} KB for 3s at 640x360`;
      } catch { /* size is a nicety, not the finding */ }
    }
  } else {
    results["step3_executes"] = "⏭ Skipped — no binary to run";
    results["step4_basic_encode"] = "⏭ Skipped";
    results["step5_zoompan_exists"] = "⏭ Skipped";
    results["step6_zoompan_expression"] = "⏭ Skipped";
    results["step7_xfade"] = "⏭ Skipped";
  }

  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});

  const zoompan = results["step5_zoompan_exists"]?.startsWith("✅") ?? false;
  const expression = results["step6_zoompan_expression"]?.startsWith("✅") ?? false;
  const xfade = results["step7_xfade"]?.startsWith("✅") ?? false;

  results["verdict"] =
    zoompan && expression && xfade
      ? "✅ FFmpeg can do everything the slideshow needs. Wire up renderPhotoSlideshow — " +
        "but rewrite its filter strings in this escaped, unquoted form first."
      : zoompan && xfade && !expression
        ? "⚠️ The filters work; the expression syntax is the problem. The escaping needs " +
          "another pass — the engine itself is fine."
        : !zoompan || !xfade
          ? "❌ A filter this feature depends on is missing from the build. Build the " +
            "slideshow on the browser canvas instead."
          : "❌ Not usable as-is — see the failing step above.";

  return NextResponse.json(results, { status: 200 });
}
