import type { Metadata } from "next";
import { Comic_Neue, Nunito } from "next/font/google";
import "./globals.css";

// Nunito is a variable font — no `weight` array, that would downgrade it to
// static instances; use Tailwind's font-weight utilities instead. Comic Neue
// only ships static weights, so it needs one explicitly. `variable` names
// match what globals.css's @theme block expects: Nunito is the site's
// --font-sans (body/UI), Comic Neue is --font-display (headings only).
const nunito = Nunito({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const comicNeue = Comic_Neue({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Guessmoji",
  description: "Decode the emoji. Guess the message.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${comicNeue.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
