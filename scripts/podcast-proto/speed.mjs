// Times lib/podcast/desk-compose.ts on one processor, as the server has.
//   node scripts/podcast-proto/speed.mjs <proto-dir>
import fs from "fs";
import path from "path";
import { composeDesk } from "../../lib/podcast/desk-compose.ts";

const dir = path.resolve(process.argv[2]);
const work = path.join(dir, "speed");
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work);
const { total, turns } = JSON.parse(fs.readFileSync(path.join(dir, "timeline.json"), "utf8"));
const t0 = Date.now();
const cpu0 = process.cpuUsage();
const out = await composeDesk({
  workDir: work, setImage: path.join(dir, "set.png"), deskImage: path.join(dir, "desk.png"),
  hostLayer: path.join(dir, "host.webm"), guestLayer: path.join(dir, "guest.webm"), audio: path.join(dir, "track-all.mp3"),
  turns, total, srt: fs.readFileSync(path.join(dir, "episode.srt"), "utf8"), threads: 1,
  onShot: (d, n) => console.log(`shot ${d}/${n} at ${((Date.now() - t0) / 1000).toFixed(0)}s`),
});
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s for ${total.toFixed(0)}s of episode → ${out}`);
