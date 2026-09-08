import type { Metadata } from "next";
import { Manrope, Source_Code_Pro } from "next/font/google";
import { notFound } from "next/navigation";
import "../globals.css";
import { Providers } from "@/components/Providers";
import { LOCALES, isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], weight: ["400", "600", "800"] });
const sourceCode = Source_Code_Pro({ variable: "--font-source-code-pro", subsets: ["latin"], weight: ["400", "500"] });

type Params = Promise<{ locale: string }>;

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getDictionary(locale);
  return {
    title: { default: t.course.name, template: `%s · ${t.course.name}` },
    description: t.course.tagline,
    alternates: { languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}`])) },
  };
}

export default async function RootLayout({ children, params }: { children: React.ReactNode; params: Params }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dictionary = await getDictionary(locale);
  return (
    <html lang={locale} className={`${manrope.variable} ${sourceCode.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <Providers locale={locale} dictionary={dictionary}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
