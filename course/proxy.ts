import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, LOCALES, LOCALE_COOKIE, isLocale, pickLocale } from "@/i18n/config";

/** Every page lives under /{locale}; a request without one is redirected (cookie, then Accept-Language, then default). */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1];
  if ((LOCALES as readonly string[]).includes(first)) return NextResponse.next();
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookie) ? cookie : (pickLocale(request.headers.get("accept-language")) ?? DEFAULT_LOCALE);
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url, 307);
}

export const config = {
  // Everything except Next internals and files with an extension (figures, fonts, fixtures, favicon).
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
