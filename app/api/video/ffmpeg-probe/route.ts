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

/**
 * Runs ffmpeg and resolves either way, so one failed step still reports.
 *
 * The whole of stderr is kept, and the useful line picked out of it. The first
 * version of this returned the last three lines, which is exactly where the
 * information isn't: "Error initializing complex filters. Invalid argument" is
 * the summary FFmpeg prints last, and the sentence naming the actual problem
 * sits above it. That truncation cost a round trip.
 */
function run(build: (cmd: ffmpeg.FfmpegCommand) => ffmpeg.FfmpegCommand, out: string) {
  return new Promise<{ ok: boolean; detail: string }>((resolve) => {
    const started = Date.now();
    const stderr: string[] = [];
    build(ffmpeg())
      .on("stderr", (line: string) => stderr.push(line))
      .on("end", () => resolve({ ok: true, detail: `${Date.now() - started} ms` }))
      .on("error", (err: Error) => {
        // Lines that name a cause, preferred over the generic summary.
        const telling = stderr.filter((l) =>
          /no such filter|invalid|cannot|unable|error|unrecognized|does not|mismatch/i.test(l),
        );
        const chosen = (telling.length ? telling : stderr).slice(-4).join(" | ");
        resolve({
          ok: false,
          detail: (chosen || err.message).replace(/\s+/g, " ").slice(0, 400),
        });
      })
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

    // Ask the binary outright, rather than inferring absence from a failed
    // render. "Is the filter here" and "did I call it correctly" were being
    // answered by the same test, and they are not the same question.
    const filters = await new Promise<string[]>((resolve) => {
      ffmpeg.getAvailableFilters((err, list) =>
        resolve(err ? [] : Object.keys(list ?? {})),
      );
    });
    results["step7_filters_present"] =
      `xfade=${filters.includes("xfade") ? "✅" : "❌"} · ` +
      `zoompan=${filters.includes("zoompan") ? "✅" : "❌"} · ` +
      `overlay=${filters.includes("overlay") ? "✅" : "❌"} · ` +
      `blend=${filters.includes("blend") ? "✅" : "❌"} · ` +
      `${filters.length} filters total`;

    const xf = join(dir, "xfade.mp4");
    const r8 = await run(
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
    results["step8_xfade_plain"] = r8.ok ? `✅ OK — ${r8.detail}` : `❌ FAILED: ${r8.detail}`;

    // xfade is famously fussy about its two inputs agreeing: same pixel
    // format, same frame rate, same timebase. lavfi sources look identical and
    // are not, so this is the standard recipe rather than a workaround — and
    // if this passes where the plain attempt failed, the engine is fine and
    // only the input handling needed saying out loud.
    const xfNorm = join(dir, "xfade-norm.mp4");
    const r9 = await run(
      (cmd) => cmd
        .input("color=c=blue:s=640x360:d=2")
        .inputFormat("lavfi")
        .input("color=c=red:s=640x360:d=2")
        .inputFormat("lavfi")
        .complexFilter(
          [
            "[0:v]format=yuv420p,fps=25,settb=AVTB[a]",
            "[1:v]format=yuv420p,fps=25,settb=AVTB[b]",
            "[a][b]xfade=transition=fade:duration=0.5:offset=1.5[out]",
          ],
          "out",
        )
        .outputOptions(["-pix_fmt yuv420p", "-t 3"]),
      xfNorm,
    );
    results["step9_xfade_normalized"] = r9.ok ? `✅ OK — ${r9.detail}` : `❌ FAILED: ${r9.detail}`;

    // The fallback if xfade is truly out: fade each photo to black and back.
    // A different look rather than a lesser one — plenty of property films cut
    // through black on purpose — so it is worth knowing it works.
    const fadeBlack = join(dir, "fade-black.mp4");
    const r10 = await run(
      (cmd) => cmd
        .input("color=c=blue:s=640x360:d=2")
        .inputFormat("lavfi")
        .complexFilter(["[0:v]fade=t=in:st=0:d=0.5,fade=t=out:st=1.5:d=0.5[out]"], "out")
        .outputOptions(["-pix_fmt yuv420p", "-t 2"]),
      fadeBlack,
    );
    results["step10_fade_through_black"] = r10.ok ? `✅ OK — ${r10.detail}` : `❌ FAILED: ${r10.detail}`;

    const best = r9.ok ? xfNorm : r8.ok ? xf : null;
    if (best) {
      try {
        const stat = await fs.stat(best);
        results["output_size"] = `${(stat.size / 1024).toFixed(0)} KB for 3s at 640x360`;
      } catch { /* size is a nicety, not the finding */ }
    }
  } else {
    results["step3_executes"] = "⏭ Skipped — no binary to run";
    results["step4_basic_encode"] = "⏭ Skipped";
    for (const k of [
      "step5_zoompan_exists", "step6_zoompan_expression", "step7_filters_present",
      "step8_xfade_plain", "step9_xfade_normalized", "step10_fade_through_black",
    ]) results[k] = "⏭ Skipped";
  }

  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});

  const kenBurns =
    (results["step5_zoompan_exists"]?.startsWith("✅") ?? false) &&
    (results["step6_zoompan_expression"]?.startsWith("✅") ?? false);
  const crossfade =
    (results["step8_xfade_plain"]?.startsWith("✅") ?? false) ||
    (results["step9_xfade_normalized"]?.startsWith("✅") ?? false);
  const throughBlack = results["step10_fade_through_black"]?.startsWith("✅") ?? false;

  results["verdict"] = !kenBurns
    ? "❌ Ken Burns itself won't run here. Build the slideshow on the browser canvas."
    : crossfade
      ? "✅ Everything the slideshow needs works. Wire up renderPhotoSlideshow — rewriting " +
        "its filter strings in the escaped, unquoted form this probe proved, and normalising " +
        "inputs before xfade if only step 9 passed."
      : throughBlack
        ? "✅ Ken Burns works; crossfades don't. Build it with fades through black between " +
          "photos — a different look, not a lesser one, and plenty of property films cut that way."
        : "⚠️ Ken Burns works but no transition does. Hard cuts, or the browser canvas.";

  return NextResponse.json(results, { status: 200 });
}
