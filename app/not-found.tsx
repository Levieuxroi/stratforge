export default function NotFound() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-xl font-semibold">Page introuvable</h1>
      <p className="mt-2 text-sm opacity-80">La page demandee n'existe pas.</p>
      <a className="mt-4 inline-block underline text-sm" href="/">
        Retour a l'accueil
      </a>
    </main>
  );
}