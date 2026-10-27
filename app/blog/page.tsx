import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/marketing/site-nav";
import { SiteFooter } from "@/components/marketing/site-footer";
import { CtaBand } from "@/components/marketing/cta-band";
import { listPublishedPosts, postDate, readMinutes } from "@/lib/blog/posts";
import { canonicalUrl } from "@/lib/seo/public-pages";

// Re-read every five minutes; publishing also refreshes it straight away.
export const revalidate = 300;

const title = "The SparkReels Blog: Video and AI Marketing for Real Estate Agents";
const description =
  "How real estate agents get found on YouTube, Google and ChatGPT: video marketing, AI tools and local content ideas from SparkReels.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: canonicalUrl("/blog") },
  openGraph: { title, description, url: canonicalUrl("/blog"), type: "website" },
};

/** The blog home (2026-10-22): every published post, newest first. */
export default async function BlogHome() {
  const posts = await listPublishedPosts();
  return (
    <div className="min-h-screen bg-white">
      <SiteNav active="blog" />
      <section className="pt-28 pb-14 px-4 sm:px-6">
        <div className="max-w-[1600px] mx-auto">
          <p className="text-lg font-bold text-[#A3660F] uppercase tracking-widest mb-3">The SparkReels Blog</p>
          <h1 className="text-3xl sm:text-4xl font-black leading-tight text-slate-900 mb-3">
            Video and AI marketing for real estate agents
          </h1>
          <p className="text-lg sm:text-xl text-slate-500 mb-10">
            How agents get found on YouTube, Google and ChatGPT, one short video at a time.
          </p>
          {posts.length === 0 ? (
            <p className="text-lg text-slate-500">The first posts are on their way.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {posts.map((p) => (
                <Link key={p.id} href={`/blog/${p.slug}`} className="group block overflow-hidden border border-slate-200 bg-white hover:border-spark-amber transition-colors">
                  {/* The moving header plays, silent, when there is one (2026-10-22). */}
                  <div className="relative">
                    {p.header_video_url ? (
                      <video autoPlay muted loop playsInline poster={p.cover_url ?? undefined} className="aspect-video w-full object-cover" aria-hidden="true">
                        <source src={p.header_video_url} type="video/mp4" />
                      </video>
                    ) : p.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.cover_url} alt="" className="aspect-video w-full object-cover" />
                    ) : (
                      <div className="aspect-video w-full bg-gradient-to-br from-slate-900 to-slate-800" />
                    )}
                    {p.video_url && (
                      <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-black/75 px-2.5 py-1 text-xs font-bold text-white">
                        ▶ Video
                      </span>
                    )}
                  </div>
                  <div className="p-5">
                    {p.topic && (
                      <span className="inline-block rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-[#BA7517]">{p.topic}</span>
                    )}
                    <h2 className="mt-2 text-xl font-bold leading-snug text-slate-900 group-hover:text-[#A3660F]">{p.title}</h2>
                    {p.description && <p className="mt-2 text-base leading-relaxed text-slate-500 line-clamp-3">{p.description}</p>}
                    <p className="mt-3 text-sm text-slate-400">
                      {[p.author_name, postDate(p.published_at), `${readMinutes(p.word_count)} min read`].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
      <CtaBand title="Write posts like these in minutes." text="Every SparkReels paid plan includes unlimited blog writing." />
      <SiteFooter />
    </div>
  );
}
