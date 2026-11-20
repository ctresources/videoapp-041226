"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, RefreshCw, Send, X } from "lucide-react";
import { FieldMic, PROSE_SILENCE_MS } from "@/components/ui/field-mic";

/**
 * The topic box as a chat (2026-11-18, the owner's approved mockup). The
 * first draft is already written and saved as a project when this opens;
 * here a second version is written beside it, the agent picks one, and can
 * then ask for changes in their own words before making the video or blog.
 * The server side is /api/ai/topic-chat. No AI company is named on screen.
 */

export interface ChatVersion { title: string; hook: string; script: string }

type Msg = { from: "me"; text: string } | { from: "her"; version: ChatVersion };

const QUICK = ["Shorter", "More casual", "Stronger hook"];
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export function TopicChat({ projectId, topic, first, asBlog, onReady, onMake, onClose }: {
  projectId: string;
  topic: string;
  first: ChatVersion;
  asBlog: boolean;
  /** Whether a version is chosen, so the page's own Next can make it. */
  onReady: (ready: boolean, changed: boolean) => void;
  onMake: (kind: "video" | "blog", changed: boolean) => void;
  onClose: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([{ from: "me", text: topic }]);
  const [versions, setVersions] = useState<ChatVersion[] | null>(null);
  const [current, setCurrent] = useState<ChatVersion | null>(null);
  const [busy, setBusy] = useState<string | null>("Writing two versions…");
  const [changed, setChanged] = useState(false);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  async function call(body: Record<string, unknown>) {
    const res = await fetch("/api/ai/topic-chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error || "Something went wrong.");
    return data as { versions?: ChatVersion[]; version?: ChatVersion };
  }

  // The second version, once, as the chat opens.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    call({ action: "second" })
      .then((d) => setVersions(d.versions ?? null))
      .catch((e) => {
        // Never a dead end: the first draft is still there to use.
        toast.error(e instanceof Error ? e.message : "Couldn't write a second version.");
        setCurrent(first);
        setMsgs((m) => [...m, { from: "her", version: first }]);
      })
      .finally(() => setBusy(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { onReady(!!current && !busy && !versions, changed); }, [current, busy, versions, changed, onReady]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [msgs, versions, busy]);

  async function pick(which: number) {
    if (!versions || busy) return;
    setBusy("Saving your pick…");
    try {
      const d = await call({ action: "pick", which });
      const v = d.version ?? versions[which];
      setMsgs((m) => [...m, { from: "me", text: `Picked Version ${which + 1}` }, { from: "her", version: v }]);
      setCurrent(v);
      setVersions(null);
      if (v.script !== first.script) setChanged(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save that pick.");
    } finally { setBusy(null); }
  }

  async function again() {
    if (busy) return;
    setBusy("Writing two new versions…");
    try {
      const d = await call({ action: "again" });
      if (d.versions?.length === 2) { setVersions(d.versions); setCurrent(null); }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't write new versions.");
    } finally { setBusy(null); }
  }

  async function send(message: string) {
    const m = message.trim();
    if (!m || busy || !current) return;
    setText("");
    setMsgs((x) => [...x, { from: "me", text: m }]);
    setBusy("Rewriting…");
    try {
      const d = await call({ action: "refine", message: m });
      if (d.version) {
        setCurrent(d.version);
        setChanged(true);
        setMsgs((x) => [...x, { from: "her", version: d.version! }]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't make that change.");
    } finally { setBusy(null); }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[17px] font-semibold text-spark-ink">What do you want to create?</p>
        <button type="button" onClick={onClose} aria-label="Start over" className="rounded-full p-1 text-spark-ink-faint hover:bg-spark-rule-soft hover:text-spark-ink">
          <X size={16} />
        </button>
      </div>

      <div className="flex max-h-[520px] flex-col gap-2.5 overflow-y-auto pr-1">
        {msgs.map((m, i) => m.from === "me" ? (
          <div key={i} className="max-w-[85%] self-end rounded-[16px_16px_4px_16px] border border-[#F0DDB8] bg-spark-amber-tint px-3 py-2 text-[14px] text-spark-ink">{m.text}</div>
        ) : (
          <Bubble key={i} v={m.version} />
        ))}

        {versions && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {versions.map((v, i) => (
              <div key={i} className="flex flex-col gap-1 rounded-[14px] border border-spark-rule bg-white p-2.5 text-[13px] leading-[1.45]">
                <span className="text-[12px] font-bold text-spark-amber">Version {i + 1}</span>
                <span className="font-bold text-spark-ink">{v.title}</span>
                <Preview v={v} className="flex-1" />
                <span className="text-[12px] text-spark-ink-faint">{words(v.script)} words</span>
                <button
                  type="button"
                  onClick={() => void pick(i)}
                  disabled={!!busy}
                  className="mt-1 rounded-full border-[1.5px] border-spark-amber py-1.5 text-[13px] font-bold text-spark-amber hover:bg-spark-amber-tint disabled:opacity-50"
                >
                  Pick this
                </button>
              </div>
            ))}
          </div>
        )}

        {busy && (
          <p className="flex items-center gap-2 text-[13px] text-spark-ink-muted"><Loader2 size={14} className="animate-spin" /> {busy}</p>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {current && QUICK.map((q) => (
          <button key={q} type="button" disabled={!!busy} onClick={() => void send(q)}
            className="rounded-full border border-spark-rule bg-white px-3 py-1.5 text-[13px] font-semibold text-spark-ink hover:border-spark-amber disabled:opacity-50">
            {q}
          </button>
        ))}
        {current && (
          <button type="button" disabled={!!busy} onClick={() => setText("Add my story about ")}
            className="rounded-full border border-spark-rule bg-white px-3 py-1.5 text-[13px] font-semibold text-spark-ink hover:border-spark-amber disabled:opacity-50">
            Add a story
          </button>
        )}
        <button type="button" disabled={!!busy} onClick={() => void again()}
          className="inline-flex items-center gap-1.5 rounded-full border border-spark-amber bg-spark-amber-tint px-3 py-1.5 text-[13px] font-semibold text-[#A3660F] disabled:opacity-50">
          <RefreshCw size={13} /> Two new versions
        </button>
      </div>

      {current && !versions && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={!!busy} onClick={() => onMake(asBlog ? "blog" : "video", changed)}
            className="rounded-full bg-spark-amber py-2.5 text-[14px] font-bold text-white hover:opacity-90 disabled:opacity-50">
            {asBlog ? "Make my blog" : "Make my video"}
          </button>
          <button type="button" disabled={!!busy} onClick={() => onMake(asBlog ? "video" : "blog", changed)}
            className="rounded-full border-[1.5px] border-spark-amber py-2.5 text-[14px] font-bold text-spark-amber hover:bg-spark-amber-tint disabled:opacity-50">
            {asBlog ? "Make my video" : "Make my blog"}
          </button>
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); void send(text); }}
        className="flex items-center gap-2 rounded-[14px] border border-spark-rule bg-white py-1.5 pl-3 pr-1.5"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!current || !!busy}
          placeholder={current ? "Tell Sparklee what to change…" : "Pick a version first"}
          className="min-w-0 flex-1 bg-transparent text-[14px] text-spark-ink outline-none placeholder:text-spark-ink-faint"
        />
        {current && <FieldMic size="md" title="Say what to change" silenceMs={PROSE_SILENCE_MS} onTranscript={(t) => setText((s) => (s ? `${s} ${t}` : t))} />}
        <button type="submit" disabled={!current || !!busy || !text.trim()}
          className="inline-flex items-center gap-1 rounded-[10px] bg-spark-amber px-3 py-2 text-[13px] font-bold text-white disabled:opacity-40">
          <Send size={13} /> Send
        </button>
      </form>
    </div>
  );
}

function Preview({ v, className = "" }: { v: ChatVersion; className?: string }) {
  const [open, setOpen] = useState(false);
  const body = [v.hook, v.script].filter(Boolean).join("\n\n");
  const short = body.length > 220 ? `${body.slice(0, 220).replace(/\s+\S*$/, "")}…` : body;
  return (
    <div className={className}>
      <p className="whitespace-pre-line text-spark-ink">{open ? body : short}</p>
      {body.length > 220 && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-0.5 text-[12px] font-semibold text-spark-amber">
          {open ? "Show less" : "Read all"}
        </button>
      )}
    </div>
  );
}

function Bubble({ v }: { v: ChatVersion }) {
  return (
    <div className="max-w-[92%] self-start rounded-[16px_16px_16px_4px] border border-spark-rule bg-white px-3 py-2.5 text-[14px] leading-[1.45]">
      <span className="mb-1 block text-[12px] font-bold text-spark-amber">Sparklee</span>
      <span className="mb-1 block font-bold text-spark-ink">{v.title}</span>
      <Preview v={v} />
      <span className="mt-1 block text-[12px] text-spark-ink-faint">{words(v.script)} words</span>
    </div>
  );
}
