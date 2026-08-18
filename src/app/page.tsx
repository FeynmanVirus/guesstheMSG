import { HomeEntry } from "@/components/home/home-entry";

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const codeParam = params?.code;
  const initialCode = typeof codeParam === "string" ? codeParam : undefined;

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 sm:py-24">
      <div className="mb-10 space-y-2 text-center">
        <h1 className="font-heading text-5xl font-semibold text-ink sm:text-6xl">
          GuessTheMSG
        </h1>
        <p className="text-ink-muted">Decode the emoji. Guess the message.</p>
      </div>
      <HomeEntry initialCode={initialCode} />
    </div>
  );
}
