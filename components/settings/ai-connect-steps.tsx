"use client";

import type { ReactNode } from "react";
import toast from "react-hot-toast";

/**
 * How to connect Claude and ChatGPT (2026-11-23, the owner's approved mockup:
 * docs/mockups/ai-connections-website-settings.html). The ChatGPT steps match
 * her real setup screen on Plus. Grok and Gemini join after a real test.
 */
const MCP_URL = "https://www.sparkreels.ai/api/mcp";
const TRY_IT = "Using SparkReels, plan a video about my local market.";

const APPS: { name: string; open: string; href: string; steps: ReactNode[]; note: string }[] = [
  {
    name: "Claude",
    open: "Open Claude",
    href: "https://claude.ai/customize/connectors",
    steps: [
      <>Open <b>Customize</b>, then <b>Connectors</b></>,
      <>Click <b>+ Add</b>, then <b>Add custom connector</b></>,
      <>Name it <b>SparkReels</b>, paste your link, click <b>Continue</b></>,
      <>Choose <b>Sign in now</b> and <b>Register automatically</b>, then <b>Add</b></>,
      <>Click <b>Allow</b> on the SparkReels page</>,
    ],
    note: "Works on every Claude plan.",
  },
  {
    name: "ChatGPT",
    open: "Open ChatGPT",
    href: "https://chatgpt.com/plugins",
    steps: [
      <>Open <b>Plugins</b> on a computer</>,
      <>Click <b>+</b>, then <b>Add custom MCP server</b></>,
      <>Name it <b>SparkReels</b> and paste your link</>,
      <>Choose <b>OAuth</b>, check <b>I understand and want to continue</b>, click <b>Create as a plugin</b></>,
      <>Click <b>Allow</b> on the SparkReels page</>,
    ],
    note: "Works on ChatGPT Plus. On Business or Enterprise, an admin may need to add it.",
  },
];

function CopyRow({ label, value }: { label: string; value: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied.");
    } catch {
      toast.error("Couldn't copy. Select the text and copy it.");
    }
  }
  return (
    <div>
      <p className="mb-1.5 mt-4 text-sm font-semibold text-spark-ink-muted">{label}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <code className="min-w-0 flex-1 break-words rounded-xl border border-spark-rule bg-spark-paper px-3.5 py-2.5 font-mono text-[15px] font-medium text-spark-ink">{value}</code>
        <button type="button" onClick={() => void copy()} aria-label={`Copy ${label}`}
          className="min-h-[44px] flex-none rounded-xl bg-spark-amber px-[18px] text-[15px] font-semibold text-white">
          Copy
        </button>
      </div>
    </div>
  );
}

export function AiConnectSteps() {
  return (
    <div>
      <CopyRow label="Your SparkReels link" value={MCP_URL} />
      <div className="mt-4 grid items-stretch gap-4 md:grid-cols-2">
        {APPS.map((a) => (
          <div key={a.name} className="flex min-w-0 flex-col rounded-2xl border border-spark-rule p-[18px]">
            <div className="mb-3 flex items-center justify-between gap-2.5">
              <h4 className="text-lg font-bold text-spark-ink">{a.name}</h4>
              <a href={a.href} target="_blank" rel="noopener noreferrer"
                className="inline-flex min-h-[38px] items-center whitespace-nowrap rounded-[9px] border-[1.5px] border-spark-amber px-3 text-sm font-bold text-[#A3660F]">
                {a.open}
              </a>
            </div>
            <ol className="mb-3.5 flex-1 list-decimal space-y-[7px] pl-[22px] text-[15.5px] text-spark-ink">
              {a.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
            <p className="border-t border-spark-rule pt-2.5 text-[13.5px] text-spark-ink-muted">{a.note}</p>
          </div>
        ))}
      </div>
      <CopyRow label="Try it in a new chat" value={TRY_IT} />
    </div>
  );
}
