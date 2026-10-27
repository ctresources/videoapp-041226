import Link from "next/link";
import { ArrowRight } from "lucide-react";

/** The navy sign-up band near the bottom of every public page. */
export function CtaBand({
  title = "Be the agent buyers see first.",
  text = "Speak. Spark. Share. Your first video is free, no credit card.",
}: { title?: string; text?: string }) {
  return (
    <section className="py-14 sm:py-16 px-4 sm:px-6 bg-slate-900 text-white">
      <div className="max-w-[1600px] mx-auto text-center">
        <h2 className="text-3xl sm:text-5xl font-black mb-4 leading-tight text-white">{title}</h2>
        <p className="text-slate-200 text-xl sm:text-2xl mb-8">{text}</p>
        <Link href="/beta" className="inline-flex items-center gap-2 bg-spark-amber text-white text-xl font-semibold px-7 py-4 hover:bg-[#A3660F] transition-colors">
          Sign up for free <ArrowRight size={18} />
        </Link>
      </div>
    </section>
  );
}
