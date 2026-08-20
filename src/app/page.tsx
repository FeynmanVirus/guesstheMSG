import { HomeEntry } from "@/components/home/home-entry";

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const codeParam = params?.code;
  const initialCode = typeof codeParam === "string" ? codeParam : undefined;

  // The "Guessmoji" heading + tagline now live inside the card itself
  // (mockup frame 1a) — this page is just the centering shell.
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 sm:py-24">
      <HomeEntry initialCode={initialCode} />
    </div>
  );
}
