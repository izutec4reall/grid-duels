import { Link } from "@tanstack/react-router";

const LINKS = [
  { to: "/", label: "Play" },
  { to: "/tournaments", label: "Tournaments" },
  { to: "/rankings", label: "Rankings" },
  { to: "/history", label: "History" },
] as const;

/** The app's pages, in the AppShell bar. */
export function AppNav() {
  return (
    <nav className="flex min-w-0 items-center gap-1 overflow-x-auto">
      {LINKS.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          activeOptions={{ exact: link.to === "/" }}
          className="rounded-md px-2 py-1 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground data-[status=active]:bg-muted data-[status=active]:text-foreground"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
