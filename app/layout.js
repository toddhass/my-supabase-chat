import "./globals.css";
import { Toaster } from "sonner";

export const metadata = {
  title: "Supa-Chat",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      {/* The body classes here handle the background to prevent "white flashes" */}
      <body className="bg-slate-950 text-slate-100 antialiased">
        <Toaster position="top-center" theme="dark" richColors />
        {children}
      </body>
    </html>
  );
}
