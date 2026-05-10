import Link from "next/link";

export type Crumb = { label: string; href?: string };

/** Mobile-first breadcrumb: each link is a 44px tap target. */
export default function Breadcrumb({ trail }: { trail: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm">
      <ol className="m-0 flex flex-wrap list-none gap-1 p-0 text-text-primary/70">
        {trail.map((c, i) => {
          const last = i === trail.length - 1;
          return (
            <li key={i} className="inline-flex items-center">
              {c.href && !last ? (
                <Link
                  href={c.href}
                  className="inline-flex items-center min-h-[44px] px-2 text-text-primary/70 hover:text-text-primary"
                >
                  {c.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className="inline-flex items-center min-h-[44px] px-2 text-text-primary">
                  {c.label}
                </span>
              )}
              {!last && <span aria-hidden className="px-1">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
