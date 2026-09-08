import { Footer } from "@/components/shell/Footer";
import { Nav } from "@/components/shell/Nav";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">{children}</main>
      <Footer />
    </>
  );
}
