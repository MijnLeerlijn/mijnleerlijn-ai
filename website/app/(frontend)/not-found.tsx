import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm font-medium tracking-[0.04em] text-grijs-400 uppercase">404</p>
      <h1 className="text-h2 font-semibold text-grijs-900">Deze pagina bestaat niet (meer)</h1>
      <Link href="/" className="text-sm text-blauw hover:underline">
        Terug naar de homepage
      </Link>
    </div>
  );
}
