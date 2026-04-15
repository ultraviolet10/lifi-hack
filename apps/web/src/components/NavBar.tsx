import { NavLink, useLocation } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";

export function NavBar() {
  const { pathname } = useLocation();
  const { authenticated, logout } = usePrivy();
  if (pathname === "/") return null;

  const link = (to: string, label: string) => (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-3 py-1.5 rounded-lg text-sm ${isActive ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white"}`
      }
    >
      {label}
    </NavLink>
  );

  return (
    <nav className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 backdrop-blur bg-black/40 border-b border-white/5">
      <div className="flex items-center gap-6">
        <span className="text-lg font-semibold tracking-tight">Earnie</span>
        <div className="flex gap-1">
          {link("/discover", "Discover")}
          {link("/portfolio", "Portfolio")}
        </div>
      </div>
      {authenticated && (
        <button onClick={logout} className="text-sm text-zinc-400 hover:text-white">
          Log out
        </button>
      )}
    </nav>
  );
}
