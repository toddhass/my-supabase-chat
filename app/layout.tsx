import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Supa-Chat",
  description: "Real-time chat powered by Supabase and Next.js",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      {/* The body classes here handle the background to prevent "white flashes" 
        during page transitions or initial load.
      */}
      <body className="bg-slate-950 text-slate-100 antialiased selection:bg-emerald-500/30">
        <Toaster position="top-center" theme="dark" richColors />
        {children}
      </body>
    </html>
  );
}
