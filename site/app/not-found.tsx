import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1>That page didn&rsquo;t bake.</h1>
      <p className="mt-3 text-text-primary/80">
        We couldn&rsquo;t find what you were looking for. Try the <Link href="/catalog">catalog</Link> or
        <Link href="/"> head home</Link>.
      </p>
    </div>
  );
}
