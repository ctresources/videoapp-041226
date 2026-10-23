import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { SiteNav } from "@/components/marketing/site-nav";
import { SiteFooter } from "@/components/marketing/site-footer";
import { getPublishedPost, listPublishedPosts, postDate, readMinutes } from "@/lib/blog/posts";
import { SITE_URL, canonicalUrl } from "@/lib/seo/public-pages";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getPublishedPost(params.slug);
  if (!post) return { title: "Post not found", robots: { index: false } };
  const url = canonicalUrl(`/blog/${post.slug}`);
  const description = post.description ?? undefined;
  return {
    title: `${post.title} | SparkReels Blog`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description,
      url,
      type: "article",
      publishedTime: post.published_at,
      modifiedTime: post.updated_at,
      ...(post.cover_url ? { images: [{ url: post.cover_url }] } : {}),
    },
    twitter: { card: "summary_large_image", title: post.title, description, ...(post.cover_url ? { images: [post.cover_url] } : {}) },
  };
}

/**
 * One blog post (2026-10-22). The article HTML comes from blogAsHtml, which
 * escapes every word, so it is safe to set as HTML. A "Try it free" box goes
 * before the article's second section.
 */
export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = await getPublishedPost(params.slug);
  if (!post) notFound();

  const blocks = post.body_html.split("\n");
  const h2s = blocks.reduce<number[]>((acc, b, i) => (b.startsWith("<h2>") ? [...acc, i] : acc), []);
  const splitAt = h2s.length >= 2 ? h2s[1] : Math.ceil(blocks.length / 2);
  const firstHalf = blocks.slice(0, splitAt).join("\n");
  const secondHalf = blocks.slice(splitAt).join("\n");

  const more = (await listPublishedPosts(4)).filter((p) => p.slug !== post.slug).slice(0, 3);

  const url = canonicalUrl(`/blog/${post.slug}`);
  const graph: Record<string, unknown>[] = [
    {
      "@type": "BlogPosting",
      headline: post.title,
      ...(post.description ? { description: post.description } : {}),
      ...(post.cover_url ? { image: post.cover_url } : {}),
      datePublished: post.published_at,
      dateModified: post.updated_at,
      mainEntityOfPage: url,
      ...(post.author_name ? { author: { "@type": "Person", name: post.author_name } } : {}),
      publisher: { "@type": "Organization", name: "SparkReels.ai", url: `${SITE_URL}/` },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Blog", item: canonicalUrl("/blog") },
        { "@type": "ListItem", position: 2, name: post.title, item: url },
      ],
    },
  ];
  if (post.faqs?.length) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: post.faqs.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    });
  }
  const schema = JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");

  return (
    <div className="min-h-screen bg-white">
      <SiteNav active="blog" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schema }} />
      <article className="pt-28 pb-14 px-4 sm:px-6">
        <div className="max-w-[760px] mx-auto">
          <p className="mb-4 text-sm text-slate-400">
            <Link href="/blog" className="hover:text-slate-600">Blog</Link>
            {post.topic ? ` › ${post.topic}` : ""}
          </p>
          <h1 className="text-3xl sm:text-4xl font-black leading-tight text-slate-900 mb-4">{post.title}</h1>
          <p className="mb-8 text-base text-slate-500">
            {[post.author_name, postDate(post.published_at), `${readMinutes(post.word_count)} min read`].filter(Boolean).join(" · ")}
          </p>
          {post.cover_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.cover_url} alt={post.title} className="mb-8 w-full rounded-xl object-cover" />
          )}
          <div className="blog-prose" dangerouslySetInnerHTML={{ __html: firstHalf }} />
          <aside className="my-10 border border-amber-200 bg-amber-50 p-6">
            <p className="text-xl font-bold text-slate-900 mb-1">Want videos like this for your market?</p>
            <p className="text-lg text-slate-600 mb-4">SparkReels turns one minute of talking into a finished video and a blog post.</p>
            <Link href="/beta" className="inline-flex items-center gap-2 bg-blue-900 text-white text-lg font-semibold px-5 py-3 hover:bg-blue-800 transition-colors">
              Try it free <ArrowRight size={16} />
            </Link>
          </aside>
          {secondHalf && <div className="blog-prose" dangerouslySetInnerHTML={{ __html: secondHalf }} />}

          {more.length > 0 && (
            <div className="mt-12 border-t border-slate-200 pt-8">
              <p className="text-lg font-bold text-slate-900 mb-3">Keep reading</p>
              <ul className="space-y-2">
                {more.map((p) => (
                  <li key={p.id}>
                    <Link href={`/blog/${p.slug}`} className="text-lg font-semibold text-blue-900 hover:underline">{p.title}</Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-8 text-base text-slate-500">
            Made with <Link href="/real-estate-blog-writer" className="font-semibold text-blue-900 hover:underline">the SparkReels AI blog writer</Link>.
          </p>
        </div>
      </article>
      <SiteFooter />
    </div>
  );
}
