import { UNITS } from "@forja/core";

// Placeholder home page. It imports from @forja/core only to prove the
// workspace link works; real screens arrive in milestone M3.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Forja</h1>
      <p className="text-balance opacity-70">
        Workout tracking is on its way. Units supported: {UNITS.join(" / ")}.
      </p>
    </main>
  );
}
