"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Plus, CheckCircle, Clock, AlertCircle, User, RefreshCw, ShieldAlert, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";

interface AvatarLook {
  id: string;
  name: string;
  preview_image_url: string | null;
  status: string | null;
}

export function AvatarLooksManager({ userId, hasAvatar }: { userId: string; hasAvatar: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [looks, setLooks] = useState<AvatarLook[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [lookName, setLookName] = useState("");
  const [showNameInput, setShowNameInput] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [consentLoading, setConsentLoading] = useState(false);

  const PENDING_STATUSES = ["processing", "pending_consent"];

  const fetchLooks = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/avatar/looks");
      if (res.ok) {
        const data = await res.json();
        setLooks(data.looks || []);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Start/stop polling based on whether any look is still in a pending state
  useEffect(() => {
    const hasPending = looks.some((l) => l.status && PENDING_STATUSES.includes(l.status));

    if (hasPending && !pollRef.current) {
      pollRef.current = setInterval(() => fetchLooks(true), 15_000);
    } else if (!hasPending && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [looks, fetchLooks]); // eslint-disable-line

  useEffect(() => {
    if (hasAvatar) fetchLooks();
  }, [hasAvatar, fetchLooks]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Image must be under 10MB"); return; }
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setShowNameInput(true);
    // Reset input so same file can be re-selected
    e.target.value = "";
  }

  function cancelAdd() {
    setPendingFile(null);
    setPreviewUrl(null);
    setShowNameInput(false);
    setLookName("");
  }

  async function handleRequestConsent() {
    setConsentLoading(true);
    try {
      const rerouteUrl = `${window.location.origin}/settings`;
      const res = await fetch("/api/avatar/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reroute_url: rerouteUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to get consent URL");
      window.open(data.url, "_blank", "noopener");
      toast.success("Complete consent in the new tab, then click refresh here.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start consent flow");
    } finally {
      setConsentLoading(false);
    }
  }

  async function handleAddLook() {
    if (!pendingFile || !lookName.trim()) {
      toast.error("Give this look a name first");
      return;
    }

    setAdding(true);
    try {
      // Upload photo to Supabase Storage first
      const supabase = createClient();
      const ext = pendingFile.name.split(".").pop() || "jpg";
      const filePath = `${userId}/looks/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(filePath, pendingFile, { upsert: false });
      if (upErr) throw new Error(upErr.message);
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(filePath);

      // Register look with HeyGen
      const res = await fetch("/api/avatar/add-look", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: publicUrl, name: lookName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create look");

      setLooks((prev) => [...prev, data.look]);
      toast.success(`"${lookName.trim()}" is training — check back in a few minutes.`);
      cancelAdd();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add look");
    } finally {
      setAdding(false);
    }
  }

  if (!hasAvatar) {
    return (
      <div className="text-xs text-slate-400 italic">
        Upload your headshot above to enable avatar looks.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-700">Avatar Looks</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Different outfits or backgrounds for your avatar · each video you pick a look
          </p>
        </div>
        <button
          onClick={fetchLooks}
          title="Refresh looks"
          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {loading ? (
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-[72px] h-[88px] rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {looks.map((look) => (
            <div key={look.id} className="flex flex-col items-center gap-1" style={{ width: 72 }}>
              <div className="relative w-[72px] h-[88px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                {look.preview_image_url ? (
                  <img
                    src={look.preview_image_url}
                    alt={look.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <User size={24} className="text-slate-300" />
                  </div>
                )}
                <div className="absolute bottom-1 right-1">
                  {look.status === "completed" || !look.status ? (
                    <CheckCircle size={14} className="text-green-500 bg-white rounded-full" />
                  ) : look.status === "processing" ? (
                    <Clock size={14} className="text-amber-500 bg-white rounded-full" />
                  ) : look.status === "pending_consent" ? (
                    <ShieldAlert size={14} className="text-purple-500 bg-white rounded-full" />
                  ) : look.status === "failed" ? (
                    <AlertCircle size={14} className="text-red-500 bg-white rounded-full" />
                  ) : null}
                </div>
              </div>
              <p className="text-[10px] text-slate-500 text-center leading-tight truncate w-full">
                {look.name}
              </p>
            </div>
          ))}

          {/* Add look tile */}
          {!showNameInput && (
            <div className="flex flex-col items-center gap-1" style={{ width: 72 }}>
              <button
                onClick={() => inputRef.current?.click()}
                className="w-[72px] h-[88px] rounded-xl border-2 border-dashed border-slate-300 hover:border-primary-400 bg-slate-50 hover:bg-primary-50 transition-colors flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-primary-500"
              >
                <Plus size={20} />
              </button>
              <p className="text-[10px] text-slate-400 text-center">Add look</p>
            </div>
          )}
        </div>
      )}

      {/* Name input + preview after file selected */}
      {showNameInput && (
        <div className="border border-slate-200 rounded-xl p-3 flex gap-3 items-start bg-slate-50">
          {previewUrl && (
            <img src={previewUrl} alt="Preview" className="w-14 h-16 rounded-lg object-cover shrink-0" />
          )}
          <div className="flex-1 flex flex-col gap-2">
            <input
              autoFocus
              type="text"
              placeholder="e.g. Blue blazer, Outdoor"
              value={lookName}
              onChange={(e) => setLookName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddLook()}
              className="text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 w-full"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAddLook}
                disabled={adding || !lookName.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium bg-primary-500 text-white rounded-lg py-2 hover:bg-primary-600 disabled:opacity-50 transition-colors"
              >
                {adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                {adding ? "Creating…" : "Create look"}
              </button>
              <button
                onClick={cancelAdd}
                disabled={adding}
                className="px-3 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {looks.some((l) => l.status === "processing") && (
        <p className="text-xs text-amber-600 flex items-center gap-1">
          <Loader2 size={11} className="animate-spin" /> Training in progress — status updates automatically.
        </p>
      )}

      {looks.some((l) => l.status === "pending_consent") && (
        <div className="flex items-start gap-2.5 p-3 bg-purple-50 border border-purple-200 rounded-xl">
          <ShieldAlert size={15} className="text-purple-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-medium text-purple-800">Consent required</p>
            <p className="text-xs text-purple-600 mt-0.5">
              HeyGen requires your approval before training can begin. Complete it in one click.
            </p>
            <button
              onClick={handleRequestConsent}
              disabled={consentLoading}
              className="mt-2 flex items-center gap-1.5 text-xs font-medium text-purple-700 hover:text-purple-900 disabled:opacity-50"
            >
              {consentLoading
                ? <Loader2 size={11} className="animate-spin" />
                : <ExternalLink size={11} />}
              {consentLoading ? "Opening…" : "Complete consent →"}
            </button>
          </div>
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
    </div>
  );
}
