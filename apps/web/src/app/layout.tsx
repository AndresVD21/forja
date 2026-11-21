import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// On phones that support it, the page (and a bottom sheet) shrinks when the keyboard opens, so the focused
// field stays visible instead of hiding behind the keyboard.
export const viewport: Viewport = { interactiveWidget: "resizes-content" };

export const metadata: Metadata = {
  title: "Forja",
  // Icons: src/app/apple-icon.png is picked up by file convention. The supplied favicon.ico has RGB
  // (not RGBA) PNG entries, which Next's `favicon.ico` convention cannot decode at build time, so it
  // sits untouched in public/ and browsers fetch /favicon.ico by default. (Setting `icons` here would
  // replace the apple-icon link, so we do not.)
};

// <html lang> depends on the language cookie, which is only known per request, so nothing under this
// layout can be prerendered into a static shell. Next's alternative (static <html> plus an inline
// script that fixes `lang` before paint) was not taken: every page here sits behind sign-in and needs
// the request anyway, and a correct server-rendered `lang` is simpler and better for screen readers.
// `instant = false` tells Next that blocking on the request is intentional.
export const instant = false;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-page text-ink">
        {/* Hands the messages to Client Components (they cannot read the request themselves). */}
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
