import type { Metadata } from "next";
import { Caveat, Nunito } from "next/font/google";
import "./globals.css";

// Variable fonts — deliberately no `weight` array, that would downgrade them
// to static instances. Use Tailwind's font-weight utilities instead.
// `variable` names match what globals.css's @theme block expects: Nunito is
// the site's --font-sans (body/UI), Caveat is --font-caveat (headings only).
const nunito = Nunito({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "GuessTheMSG",
  description: "Decode the emoji. Guess the message.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${caveat.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
