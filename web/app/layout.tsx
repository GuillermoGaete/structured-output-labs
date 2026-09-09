import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { BackendProvider } from "@/components/BackendProvider";
import { Header } from "@/components/Header";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Structured Output Labs",
  description: "Watch constrained decoding mask a language model's logits, token by token.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <BackendProvider>
          <Header />
          <main className="flex-1 w-full max-w-[1500px] mx-auto px-5 py-6">{children}</main>
        </BackendProvider>
      </body>
    </html>
  );
}
