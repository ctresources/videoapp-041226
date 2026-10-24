"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Admin → Emails (2026-10-24, the owner's mockup): GoHighLevel workflow
 * requests, saved replies, and every email SparkReels sends, previewed
 * exactly as it goes out.
 */

interface Request {
  id: string; name: string | null; email: string; plan: string | null; requested_at: string;
  status: "waiting" | "sent"; sent_at: string | null; sent_how: "sparkreels" | "marked" | null;
  sent_subject: string | null; sent_html: string | null;
}
interface Reply { id: string; slug: string | null; name: string; subject: string; body: string; updated_at: string }
interface CatalogItem { key: string; name: string; goesTo: string; when: string }
interface Email { from?: string; reply_to?: string; subject?: string; html?: string; text?: string }

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

async function call(body: Record<string, unknown>) {
  const res = await fetch("/api/admin/emails", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((out as { error?: string }).error || "Something went wrong.");
  return out as Record<string, unknown>;
}

/** An email shown exactly as it arrives. Sandboxed: nothing in it runs. */
function EmailView({ email, onClose }: { email: Email; onClose?: () => void }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 text-[13px] leading-relaxed text-slate-500">
        <div>
          From <b className="text-slate-800">{email.from}</b><br />
          {email.reply_to && <>Replies to <b className="text-slate-800">{email.reply_to}</b><br /></>}
          Subject <b className="text-slate-800">{email.subject}</b>
        </div>
        {onClose && <button onClick={onClose} className="text-xs font-semibold text-blue-600">Close</button>}
      </div>
      {email.html
        ? <iframe title="Email preview" sandbox="" srcDoc={email.html} className="h-[560px] w-full bg-white" />
        : <pre className="whitespace-pre-wrap p-4 text-sm">{email.text}</pre>}
    </div>
  );
}

function Requests({ requests, reload, onPreviewReply }: {
  requests: Request[]; reload: () => void; onPreviewReply: (name: string | null) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [viewing, setViewing] = useState<Request | null>(null);
  const waiting = requests.filter((r) => r.status === "waiting").length;

  async function act(id: string, body: Record<string, unknown>, done: string) {
    setBusy(id);
    try { await call(body); toast.success(done); reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(null); }
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-brand-text">GoHighLevel workflow requests</h3>
        <span className="text-sm text-slate-500">{waiting} waiting · {requests.length - waiting} sent</span>
      </div>
      {requests.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">No requests yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                {["Name", "Email", "Plan", "Asked", "Status", ""].map((h) => <th key={h} className="whitespace-nowrap px-2 py-2 font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="px-2 py-2.5 font-semibold text-slate-800">{r.name || "—"}</td>
                  <td className="px-2 py-2.5 text-slate-600">{r.email}</td>
                  <td className="px-2 py-2.5 text-slate-500">{r.plan ?? "—"}</td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-slate-500">{day(r.requested_at)}</td>
                  <td className="whitespace-nowrap px-2 py-2.5">
                    {r.status === "waiting"
                      ? <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">Waiting</span>
                      : <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                          {r.sent_how === "marked" ? "Marked sent" : "Sent"} {r.sent_at ? day(r.sent_at) : ""}
                        </span>}
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {r.status === "waiting" ? (
                        <>
                          <Button size="sm" loading={busy === r.id}
                            onClick={() => { if (window.confirm(`Send the GoHighLevel workflow to ${r.email}?`)) void act(r.id, { action: "send_request", id: r.id }, `Sent to ${r.email}`); }}>
                            Send workflow
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => onPreviewReply(r.name)}>Preview</Button>
                          <button className="px-1 text-xs font-semibold text-blue-600" onClick={() => void act(r.id, { action: "mark_sent", id: r.id }, "Marked sent")}>Mark sent</button>
                        </>
                      ) : r.sent_html ? (
                        <Button size="sm" variant="outline" onClick={() => setViewing(viewing?.id === r.id ? null : r)}>View what was sent</Button>
                      ) : (
                        <Button size="sm" variant="outline" loading={busy === r.id}
                          onClick={() => { if (window.confirm(`Send the GoHighLevel workflow to ${r.email}?`)) void act(r.id, { action: "send_request", id: r.id }, `Sent to ${r.email}`); }}>
                          Send again
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {viewing?.sent_html && (
        <div className="mt-4">
          <EmailView email={{ from: "SparkReels <support@sparkreels.ai>", subject: viewing.sent_subject ?? "", html: viewing.sent_html }} onClose={() => setViewing(null)} />
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name"
          className="min-w-[160px] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email"
          className="min-w-[200px] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
        <Button size="sm" variant="outline" loading={busy === "add"} className="gap-1"
          onClick={async () => {
            await act("add", { action: "add_request", name, email }, "Added");
            setName(""); setEmail("");
          }}><Plus size={14} /> Add request</Button>
      </div>
    </Card>
  );
}

function Replies({ replies, reload, preview, setPreview }: {
  replies: Reply[]; reload: () => void; preview: Email | null; setPreview: (e: Email | null) => void;
}) {
  const [selected, setSelected] = useState<string | "new" | null>(replies[0]?.id ?? null);
  const current = replies.find((r) => r.id === selected) ?? null;
  const [draft, setDraft] = useState({ name: "", subject: "", body: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selected === "new") setDraft({ name: "", subject: "", body: "Hi {{first_name}},\n\n" });
    else if (current) setDraft({ name: current.name, subject: current.subject, body: current.body });
  }, [selected, current]);

  async function save() {
    setSaving(true);
    try {
      const out = await call({ action: "save_reply", id: selected === "new" ? undefined : selected, ...draft });
      toast.success("Saved.");
      reload();
      if (selected === "new") setSelected(String(out.id));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save it."); }
    finally { setSaving(false); }
  }
  async function showPreview() {
    try { const out = await call({ action: "preview_reply", subject: draft.subject, body: draft.body, firstName: "Jane" }); setPreview(out.email as Email); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't preview it."); }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-brand-text">Saved replies</h3>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setSelected("new")}><Plus size={14} /> New</Button>
        </div>
        <div className="flex flex-col gap-2">
          {replies.map((r) => (
            <button key={r.id} onClick={() => { setSelected(r.id); setPreview(null); }}
              className={`rounded-xl border px-3 py-2.5 text-left ${selected === r.id ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-blue-300"}`}>
              <p className="text-sm font-semibold text-slate-800">{r.name}</p>
              <p className="text-xs text-slate-500">Edited {day(r.updated_at)}</p>
            </button>
          ))}
        </div>
      </Card>
      <Card>
        {selected ? (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Reply name"
                className="min-w-0 flex-1 rounded-lg border border-transparent px-1 text-base font-bold text-brand-text outline-none hover:border-slate-200 focus:border-blue-400" />
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" loading={saving} onClick={() => void save()}>Save</Button>
                <Button size="sm" variant="outline" onClick={() => void showPreview()}>Preview</Button>
                <Button size="sm" variant="outline" onClick={async () => {
                  try { await navigator.clipboard.writeText(draft.body); toast.success("Copied."); } catch { toast.error("Couldn't copy."); }
                }}>Copy</Button>
                {current && !current.slug && (
                  <Button size="sm" variant="ghost" onClick={async () => {
                    if (!window.confirm(`Delete "${current.name}"?`)) return;
                    try { await call({ action: "delete_reply", id: current.id }); setSelected(null); reload(); }
                    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't delete it."); }
                  }}>Delete</Button>
                )}
              </div>
            </div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Subject</label>
            <input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
              className="mb-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              Message · <code className="rounded bg-blue-50 px-1 text-blue-700">{"{{first_name}}"}</code> fills in their name · **bold** · &quot;- &quot; for bullets
            </label>
            <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={18}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-[13px] leading-relaxed outline-none focus:border-blue-400" />
            <p className="mt-2 text-xs text-slate-500">Sent from SparkReels &lt;support@sparkreels.ai&gt;. The SparkReels Team sign-off is added if the message leaves it out.</p>
            {preview && <div className="mt-4"><EmailView email={preview} onClose={() => setPreview(null)} /></div>}
          </>
        ) : (
          <p className="py-10 text-center text-sm text-slate-400">Pick a reply, or press New.</p>
        )}
      </Card>
    </div>
  );
}

function Catalog({ catalog }: { catalog: CatalogItem[] }) {
  const [key, setKey] = useState<string | null>(catalog[0]?.key ?? null);
  const [email, setEmail] = useState<Email | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!key) return;
    setLoading(true); setError(null); setEmail(null);
    fetch(`/api/admin/emails?preview=${encodeURIComponent(key)}`)
      .then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b.error || "Couldn't build it."); setEmail(b.email); })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't build it."))
      .finally(() => setLoading(false));
  }, [key]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-brand-text">Emails SparkReels sends</h3>
          <span className="text-sm text-slate-500">{catalog.length}</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="px-2 py-2 font-semibold">Email</th><th className="px-2 py-2 font-semibold">Goes to</th><th className="px-2 py-2 font-semibold">When</th>
            </tr>
          </thead>
          <tbody>
            {catalog.map((c) => (
              <tr key={c.key} onClick={() => setKey(c.key)}
                className={`cursor-pointer border-b border-slate-100 ${key === c.key ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                <td className="px-2 py-2.5 font-semibold text-slate-800">{c.name}</td>
                <td className="px-2 py-2.5 text-xs text-slate-500">{c.goesTo}</td>
                <td className="px-2 py-2.5 text-xs text-slate-500">{c.when}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-slate-400">To change the wording of one of these, ask for it to be changed in the app.</p>
      </Card>
      <div>
        <p className="mb-2 text-xs text-slate-500">Exactly as sent · sample name &quot;Jane&quot;</p>
        {loading ? <div className="flex justify-center py-16"><Loader2 className="animate-spin text-blue-500" /></div>
          : error ? <Card><p className="text-sm text-red-600">{error}</p></Card>
          : email ? <EmailView email={email} /> : null}
      </div>
    </div>
  );
}

export function EmailsTab() {
  const [section, setSection] = useState<"ghl" | "replies" | "catalog">("ghl");
  const [data, setData] = useState<{ requests: Request[]; replies: Reply[]; catalog: CatalogItem[] } | null>(null);
  const [preview, setPreview] = useState<Email | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/emails");
    if (res.ok) setData(await res.json());
    else toast.error("Couldn't load emails.");
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function previewGhlFor(name: string | null) {
    const reply = data?.replies.find((r) => r.slug === "ghl-workflow");
    if (!reply) return;
    try {
      const out = await call({ action: "preview_reply", subject: reply.subject, body: reply.body, firstName: (name ?? "").split(" ")[0] });
      setPreview(out.email as Email);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't preview it."); }
  }

  if (!data) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-blue-500" /></div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {([["ghl", "GoHighLevel requests"], ["replies", "Saved replies"], ["catalog", "Emails SparkReels sends"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => { setSection(k); setPreview(null); }}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${section === k ? "bg-slate-800 text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}>
            {label}
          </button>
        ))}
      </div>
      {section === "ghl" && (
        <>
          <Requests requests={data.requests} reload={() => void load()} onPreviewReply={(n) => void previewGhlFor(n)} />
          {preview && <EmailView email={preview} onClose={() => setPreview(null)} />}
        </>
      )}
      {section === "replies" && <Replies replies={data.replies} reload={() => void load()} preview={preview} setPreview={setPreview} />}
      {section === "catalog" && <Catalog catalog={data.catalog} />}
    </div>
  );
}
