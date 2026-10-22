import type { Faq } from "@/lib/marketing/content";

/** FAQPage schema for a list of questions, as a JSON-LD script. */
export function FaqSchema({ items }: { items: Faq[] }) {
  if (!items.length) return null;
  const json = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  }).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

/**
 * Questions in open-and-close boxes. `schema` adds the FAQ tags; give it to
 * one page per set of questions only (the landing page's short list repeats
 * the FAQ page's, so only /faq carries them).
 */
export function FaqList({ items, schema = true, openFirst = true }: { items: Faq[]; schema?: boolean; openFirst?: boolean }) {
  return (
    <div className="space-y-3">
      {items.map(({ q, a }, i) => (
        <details key={q} open={openFirst && i === 0} className="group border border-slate-200 bg-white px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-bold text-slate-900">
            {q}
            <span className="shrink-0 text-2xl font-normal text-amber-600 transition-transform group-open:rotate-45">+</span>
          </summary>
          <p className="mt-3 text-lg leading-relaxed text-slate-600">{a}</p>
        </details>
      ))}
      {schema && <FaqSchema items={items} />}
    </div>
  );
}
