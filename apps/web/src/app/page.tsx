import { APP_NAME } from "@retempo/shared";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <section className="w-full max-w-2xl">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Initial skeleton</p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-950">{APP_NAME}</h1>
        <p className="mt-4 text-lg text-slate-700">
          Monorepo workspace for the Retempo web, API, shared package, database package, and contracts.
        </p>
      </section>
    </main>
  );
}
