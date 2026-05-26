import Image from "next/image";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50/30 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Link href="/">
            <Image
              src="https://fifryrqhrfnzbwpvvvkz.supabase.co/storage/v1/object/public/assets/xpressreel-logo.svg"
              alt="XpressReel"
              width={180}
              height={60}
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
