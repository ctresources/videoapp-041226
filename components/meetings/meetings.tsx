"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, ExternalLink, Trash2, Video, X } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/providers/supabase-provider";

/**
 * Google Meet calls scheduled from SparkReels (2026-10-20, the owner's
 * mockup).
 *
 * SparkReels can't read the agent's Google Calendar without a new Google
 * permission (and another verification), so the details are entered here
 * first: saved to `meetings` for Spark Calendar, then handed to a new Google
 * Calendar event, filled in, which the agent saves and sends from Google.
 * Google adds the Meet link. What SparkReels can't know is whether that Save
 * was pressed, which is why every meeting can be removed here.
 */

/** Opens the Schedule a Google Meet box from anywhere (the Meet menus). */
export const SCHEDULE_MEET_EVENT = "spark:schedule-meet";

/** Spark Calendar re-reads its meetings when one is added. */
const MEETINGS_CHANGED = "spark:meetings-changed";

export interface Meeting {
  id: string;
  client_name: string;
  client_email: string | null;
  starts_at: string;
  minutes: number;
}

/** "20261028T190000Z", the form Google Calendar's link takes. */
function gcalStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** A new Google Calendar event with everything filled in. */
function newEventUrl(name: string, email: string, start: Date, minutes: number): string {
  const end = new Date(start.getTime() + minutes * 60_000);
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: `Video call with ${name}`,
    dates: `${gcalStamp(start)}/${gcalStamp(end)}`,
    details: "Google Meet video call",
  });
  if (email) q.set("add", email);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** That day in Google Calendar, where the saved event and its Meet link are. */
export function googleCalendarDayUrl(iso: string): string {
  const d = new Date(iso);
  return `https://calendar.google.com/calendar/r/day/${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export function meetingTimeLabel(m: Meeting): string {
  const start = new Date(m.starts_at);
  const end = new Date(start.getTime() + m.minutes * 60_000);
  const day = start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${t(start)}–${t(end)}`;
}

/** The signed-in agent's meetings, kept current when one is added or removed. */
export function useMeetings() {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await createClient()
      .from("meetings")
      .select("id, client_name, client_email, starts_at, minutes")
      .order("starts_at");
    setMeetings((data ?? []) as Meeting[]);
  }, [user]);
  useEffect(() => {
    void load();
    const again = () => void load();
    window.addEventListener(MEETINGS_CHANGED, again);
    return () => window.removeEventListener(MEETINGS_CHANGED, again);
  }, [load]);
  return meetings;
}

/** A meeting on a calendar day: gold, with a camera. */
export function MeetingChip({ meeting, onOpen }: { meeting: Meeting; onOpen: (m: Meeting) => void }) {
  const time = new Date(meeting.starts_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return (
    <button
      type="button"
      onClick={() => onOpen(meeting)}
      title={`Video call with ${meeting.client_name}`}
      className="flex w-full items-center gap-1 truncate rounded-md bg-spark-amber px-1.5 py-0.5 text-left text-[10.5px] font-medium text-white transition hover:brightness-[0.95]"
    >
      <Video size={10} className="shrink-0" />
      <span className="truncate">{time} {meeting.client_name}</span>
    </button>
  );
}

/** A meeting's details: open the day in Google Calendar, or remove it here. */
export function MeetingDrawer({ meeting, onClose }: { meeting: Meeting; onClose: () => void }) {
  const [removing, setRemoving] = useState(false);
  async function remove() {
    setRemoving(true);
    const { error } = await createClient().from("meetings").delete().eq("id", meeting.id);
    setRemoving(false);
    if (error) { toast.error("Couldn't remove it. Try again."); return; }
    window.dispatchEvent(new Event(MEETINGS_CHANGED));
    toast.success("Removed from Spark Calendar.");
    onClose();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-spark-amber-tint">
              <Video size={18} className="text-spark-amber" />
            </div>
            <div>
              <p className="text-sm font-semibold text-brand-text">Video call with {meeting.client_name}</p>
              <p className="text-xs text-slate-400">{meetingTimeLabel(meeting)}</p>
              {meeting.client_email && <p className="text-xs text-slate-400">{meeting.client_email}</p>}
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100" aria-label="Close">
            <X size={16} className="text-slate-400" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={googleCalendarDayUrl(meeting.starts_at)} target="_blank" rel="noopener noreferrer" className="flex-1">
            <Button variant="outline" size="sm" className="w-full gap-2">
              <ExternalLink size={14} /> Open in Google Calendar
            </Button>
          </a>
          <Button variant="ghost" size="sm" loading={removing} onClick={() => void remove()} className="gap-2">
            <Trash2 size={14} /> Remove
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Today's date and the next whole hour, as the boxes want them. */
function startDefaults() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:00`,
  };
}

/**
 * The Schedule a Google Meet box, mounted once in the app frame and opened by
 * SCHEDULE_MEET_EVENT from either Meet menu.
 */
export function ScheduleMeetDialog() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [minutes, setMinutes] = useState(30);

  useEffect(() => {
    const show = () => {
      const d = startDefaults();
      setName(""); setEmail(""); setDate(d.date); setTime(d.time); setMinutes(30);
      setOpen(true);
    };
    window.addEventListener(SCHEDULE_MEET_EVENT, show);
    return () => window.removeEventListener(SCHEDULE_MEET_EVENT, show);
  }, []);

  if (!open) return null;

  const schedule = () => {
    const who = name.trim();
    const mail = email.trim();
    const start = new Date(`${date}T${time}`);
    if (!who) { toast.error("Add your client's name"); return; }
    if (mail && !/^\S+@\S+\.\S+$/.test(mail)) { toast.error("That email doesn't look right"); return; }
    if (!date || !time || Number.isNaN(start.getTime())) { toast.error("Pick a date and time"); return; }
    if (!user) return;
    // Opened here, in the click itself, so a popup blocker lets it through.
    window.open(newEventUrl(who, mail, start, minutes), "_blank", "noopener");
    setOpen(false);
    void createClient()
      .from("meetings")
      .insert({ user_id: user.id, client_name: who, client_email: mail || null, starts_at: start.toISOString(), minutes })
      .then(({ error }) => {
        if (error) { toast.error("Google Calendar opened, but it couldn't be added to Spark Calendar."); return; }
        window.dispatchEvent(new Event(MEETINGS_CHANGED));
        toast.success("Added to Spark Calendar. Press Save in Google Calendar to send the invite.");
      });
  };

  const field = "w-full rounded-xl border border-spark-rule bg-white px-3 py-2 text-sm text-spark-ink outline-none focus:border-spark-amber";
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setOpen(false)}>
      <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-brand-text">
            <CalendarPlus size={18} className="text-spark-amber" /> Schedule a Google Meet
          </h2>
          <button onClick={() => setOpen(false)} className="rounded-lg p-1 hover:bg-slate-100" aria-label="Close">
            <X size={16} className="text-slate-400" />
          </button>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs text-spark-ink-muted">Client name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={field} autoFocus />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-spark-ink-muted">Client email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
        </label>
        <div className="flex gap-2">
          <label className="block flex-1">
            <span className="mb-1 block text-xs text-spark-ink-muted">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
          </label>
          <label className="block flex-1">
            <span className="mb-1 block text-xs text-spark-ink-muted">Time</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} />
          </label>
          <label className="block w-24">
            <span className="mb-1 block text-xs text-spark-ink-muted">Length</span>
            <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={field}>
              {[15, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </label>
        </div>
        <Button onClick={schedule} size="lg" className="w-full gap-2">
          Schedule in Google Calendar →
        </Button>
      </div>
    </div>
  );
}
