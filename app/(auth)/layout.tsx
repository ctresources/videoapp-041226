import Image from "next/image";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50/30 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Link href="/">
            {/* The new SparkReels.ai logo, light-background copy (2026-10-16). */}
            <Image
              src="/sparkreels-logo-light.png"
              alt="SparkReels.ai — Speak. Spark. Share."
              width={260}
              height={52}
              unoptimized
              priority
            />
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
