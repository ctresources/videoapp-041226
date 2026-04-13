"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  Webhook, Plus, Trash2, ToggleLeft, ToggleRight,
  ChevronDown, ChevronUp, CheckCircle, XCircle, Send, Eye, EyeOff,
} from "lucide-react";

interface CrmWebhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  is_active: boolean;
  created_at: string;
}

const ALL_EVENTS = [
  { value: "video.published", label: "Video Published" },
  { value: "video.created",   label: "Video Created (draft)" },
  { value: "video.failed",    label: "Video Failed" },
  { value: "listing.created", label: "Listing Video Created" },
];

// CRM platform presets — URL hints + setup guides
const CRM_PRESETS = [
  {
    id: "ghl",
    name: "GoHighLevel",
    logo: "🚀",
    color: "bg-orange-50 border-orange-200",
    guide: "In GHL → Automations → Create Workflow → Add Trigger: \"Inbound Webhook\" → copy the webhook URL and paste it below.",
    urlHint: "https://services.leadconnectorhq.com/hooks/...",
  },
  {
    id: "hubspot",
    name: "HubSpot",
    logo: "🟠",
    color: "bg-amber-50 border-amber-200",
    guide: "In HubSpot → Automation → Workflows → Create Workflow → Add Action: \"Send Webhook (POST)\" → copy the URL they give you.",
    urlHint: "https://api.hubspot.com/...",
  },
  {
    id: "fub",
    name: "Follow Up Boss",
    logo: "🎯",
    color: "bg-blue-50 border-blue-200",
    guide: "In FUB → Admin → API → Webhooks → New Webhook → select events → copy the generated URL. Or use Zapier: Zapier → New Zap → Trigger: Webhooks by Zapier (Catch Hook) → copy the URL.",
    urlHint: "https://hooks.zapier.com/hooks/catch/...",
  },
  {
    id: "boldtrail",
    name: "BoldTrail",
    logo: "⚡",
    color: "bg-purple-50 border-purple-200",
    guide: "In BoldTrail → Settings → Integrations → Webhooks → Add Webhook → select \"Video Published\" events → copy the endpoint URL and paste it below.",
    urlHint: "https://app.boldtrail.com/api/webhooks/...",
  },
];

export function CrmIntegrations() {
  const [webhooks, setWebhooks] = useState<CrmWebhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, "ok" | "fail" | "testing">>({});
  const [showSecret, setShowSecret] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: "",
    url: "",
    secret: "",
    events: ["video.published"],
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadWebhooks(); }, []);

  async function loadWebhooks() {
    setLoading(true);
    const res = await fetch("/api/crm/webhooks");
    const data = await res.json();
    setWebhooks(data.webhooks ?? []);
    setLoading(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.url.trim()) return toast.error("Name and URL required");
    setSaving(true);
    const res = await fetch("/api/crm/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error); setSaving(false); return; }
    setWebhooks((w) => [data.webhook, ...w]);
    setForm({ name: "", url: "", secret: "", events: ["video.published"] });
    setShowForm(false);
    toast.success("Webhook added!");
    setSaving(false);
  }

  async function handleToggle(webhook: CrmWebhook) {
    const next = !webhook.is_active;
    setWebhooks((w) => w.map((x) => x.id === webhook.id ? { ...x, is_active: next } : x));
    await fetch("/api/crm/webhooks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: webhook.id, is_active: next }),
    });
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this webhook?")) return;
    setWebhooks((w) => w.filter((x) => x.id !== id));
    await fetch(`/api/crm/webhooks?id=${id}`, { method: "DELETE" });
    toast.success("Webhook removed");
  }

  async function handleTest(id: string) {
    setTestResults((r) => ({ ...r, [id]: "testing" }));
    const res = await fetch("/api/crm/webhooks/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    const result = data.ok ? "ok" : "fail";
    setTestResults((r) => ({ ...r, [id]: result }));
    if (result === "ok") toast.success("Test delivered successfully!");
    else toast.error(`Test failed: ${data.error || `HTTP ${data.status}`}`);
  }

  function toggleEvent(ev: string) {
    setForm((f) => ({
      ...f,
      events: f.events.includes(ev)
        ? f.events.filter((e) => e !== ev)
        : [...f.events, ev],
    }));
  }

  function applyPreset(preset: typeof CRM_PRESETS[0]) {
    setForm((f) => ({ ...f, name: preset.name }));
    setShowForm(true);
    setExpandedGuide(null);
  }

  return (
    <div className="flex flex-col gap-5">

      {/* CRM preset tiles */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Supported CRMs</p>
        <div className="grid grid-cols-2 gap-2">
          {CRM_PRESETS.map((crm) => (
            <div key={crm.id} className={`rounded-xl border p-3 ${crm.color}`}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{crm.logo}</span>
                  <span className="text-sm font-semibold text-slate-700">{crm.name}</span>
                </div>
                <button
                  onClick={() => setExpandedGuide(expandedGuide === crm.id ? null : crm.id)}
                  className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-0.5"
                >
                  Setup
                  {expandedGuide === crm.id
                    ? <ChevronUp size={12} />
                    : <ChevronDown size={12} />}
                </button>
              </div>

              {expandedGuide === crm.id && (
                <div className="mt-2 mb-3">
                  <p className="text-xs text-slate-600 leading-relaxed">{crm.guide}</p>
                  <p className="text-xs text-slate-400 mt-1.5 font-mono truncate">{crm.urlHint}</p>
                </div>
              )}

              <button
                onClick={() => applyPreset(crm)}
                className="w-full text-xs font-medium py-1.5 rounded-lg bg-white/70 hover:bg-white border border-white/50 text-slate-600 hover:text-slate-800 transition-all"
              >
                + Connect {crm.name}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Add webhook form */}
      {showForm && (
        <form onSubmit={handleAdd} className="flex flex-col gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
          <p className="text-sm font-semibold text-slate-700">New Webhook</p>

          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1.5">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="GoHighLevel Production"
              className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1.5">Webhook URL</label>
            <input
              type="url"
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="https://..."
              className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1.5">
              Secret <span className="text-slate-400 font-normal">(optional — for HMAC signature verification)</span>
            </label>
            <div className="relative">
              <input
                type={showSecret ? "text" : "password"}
                value={form.secret}
                onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
                placeholder="your-secret-key"
                className="w-full text-sm px-3 py-2.5 pr-10 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
              />
              <button
                type="button"
                onClick={() => setShowSecret((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 block mb-2">Trigger on</label>
            <div className="flex flex-wrap gap-2">
              {ALL_EVENTS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleEvent(value)}
                  className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
                    form.events.includes(value)
                      ? "bg-primary-500 text-white border-primary-500"
                      : "bg-white text-slate-500 border-slate-200 hover:border-primary-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="submit" loading={saving} size="sm" className="gap-1.5">
              <Webhook size={13} /> Save Webhook
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Add button */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 w-full px-4 py-3 rounded-xl border-2 border-dashed border-slate-200 hover:border-primary-300 hover:bg-primary-50/30 transition-all text-sm font-medium text-slate-500 hover:text-primary-600"
        >
          <Plus size={15} /> Add custom webhook URL
        </button>
      )}

      {/* Existing webhooks */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : webhooks.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-4">
          No webhooks yet — connect a CRM above to get started.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Active Webhooks</p>
          {webhooks.map((wh) => {
            const testResult = testResults[wh.id];
            return (
              <div
                key={wh.id}
                className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all ${
                  wh.is_active ? "bg-white border-slate-200" : "bg-slate-50 border-slate-200 opacity-60"
                }`}
              >
                {/* Toggle */}
                <button onClick={() => handleToggle(wh)} className="shrink-0 text-slate-400 hover:text-primary-500 transition-colors">
                  {wh.is_active
                    ? <ToggleRight size={22} className="text-primary-500" />
                    : <ToggleLeft size={22} />}
                </button>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700 truncate">{wh.name}</p>
                  <p className="text-xs text-slate-400 truncate">{wh.url}</p>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {wh.events.map((ev) => (
                      <span key={ev} className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                        {ev}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {testResult === "ok" && <CheckCircle size={14} className="text-green-500" />}
                  {testResult === "fail" && <XCircle size={14} className="text-red-500" />}
                  <button
                    onClick={() => handleTest(wh.id)}
                    disabled={testResult === "testing"}
                    title="Send test payload"
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-40"
                  >
                    <Send size={13} />
                  </button>
                  <button
                    onClick={() => handleDelete(wh.id)}
                    title="Remove webhook"
                    className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Payload format */}
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
        <p className="text-xs font-semibold text-slate-600 mb-1.5">Webhook Payload Format</p>
        <pre className="text-[10px] text-slate-500 leading-relaxed overflow-x-auto">{`{
  "event": "video.published",
  "timestamp": "2025-12-29T00:00:00.000Z",
  "source": "VoiceToVideos.AI",
  "data": {
    "video_id": "uuid",
    "title": "Austin Market Update Q1",
    "video_url": "https://...",
    "project_type": "blog_video"
  }
}`}</pre>
        <p className="text-[10px] text-slate-400 mt-1.5">
          When a secret is set, requests include <code>X-VTV-Signature: sha256=...</code> for verification.
        </p>
      </div>
    </div>
  );
}
