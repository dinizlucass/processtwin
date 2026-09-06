"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import { usePanelPreference } from "@/lib/usePanelPreference";

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Visão Executiva",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </svg>
    ),
  },
  {
    href: "/mapeamento",
    label: "Mapeamento",
    badge: "IA",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    href: "/processos",
    matchPrefix: "/modelagem",
    label: "Processos",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="8" height="8" rx="2" />
        <path d="M7 11v4a2 2 0 0 0 2 2h4" />
        <rect x="13" y="13" width="8" height="8" rx="2" />
      </svg>
    ),
  },
  {
    href: "/grafo",
    matchPrefix: "/grafo",
    label: "Conexões",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="5" cy="6" r="2.5" />
        <circle cx="18" cy="5" r="2.5" />
        <circle cx="12" cy="18" r="2.5" />
        <path d="m7.1 7.2 3.6 8.5M15.7 6.9 13.1 15.7M7.3 5.6l8.2-.9" />
      </svg>
    ),
  },
  {
    href: "/conversas",
    matchPrefix: "/conversas",
    label: "Conversas",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 8v4l3 2" />
        <path d="M3.05 11a9 9 0 1 1 .5 4" />
        <path d="M3 21v-5h5" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const compactScreen = useSyncExternalStore(
    (notify) => { const media = matchMedia("(max-width: 1279px)"); media.addEventListener("change", notify); return () => media.removeEventListener("change", notify); },
    () => matchMedia("(max-width: 1279px)").matches,
    () => false,
  );
  const [preference, setPreference] = usePanelPreference("pt-sidebar-collapsed");
  const collapsed = preference ?? (compactScreen || pathname.startsWith("/modelagem/"));

  const toggle = () => setPreference(!collapsed);

  return (
    <aside
      className={`flex flex-none flex-col gap-1 bg-sidebar py-5 overflow-y-auto transition-[width] duration-200 ease-out ${
        collapsed ? "w-[68px] px-2.5" : "w-[224px] px-3.5"
      }`}
    >
      {/* MARCA + BOTÃO RECOLHER */}
      <div className={`flex items-center pb-4 ${collapsed ? "justify-center px-0" : "gap-2.5 px-2"}`}>
        <div className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-gradient-to-br from-accent-2 to-accent">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="5" cy="6" r="3" />
            <circle cx="19" cy="18" r="3" />
            <path d="M8 6h8a3 3 0 0 1 3 3v1" />
            <path d="M16 18H8a3 3 0 0 1-3-3v-1" />
          </svg>
        </div>
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold tracking-tight text-white">ProcessTwin</div>
              <div className="text-[10.5px] font-medium text-muted">Gêmeo Digital Corporativo</div>
            </div>
            <button
              onClick={toggle}
              title="Recolher menu"
              className="flex h-6 w-6 flex-none items-center justify-center rounded-md text-slate-400 hover:bg-sidebar-hover hover:text-white"
            >
              <ChevronsIcon direction="left" />
            </button>
          </>
        )}
      </div>

      {collapsed && (
        <button
          onClick={toggle}
          title="Expandir menu"
          className="mb-1 flex h-8 items-center justify-center rounded-[10px] text-slate-400 hover:bg-sidebar-hover hover:text-white"
        >
          <ChevronsIcon direction="right" />
        </button>
      )}

      {!collapsed && (
        <div className="px-3 pb-1.5 text-[10px] font-bold tracking-[.09em] text-slate-500 uppercase">Plataforma</div>
      )}

      <nav aria-label="Navegação principal" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || (item.matchPrefix && pathname.startsWith(item.matchPrefix));
        return (
          <Link
            key={item.href}
            href={item.href}
            title={collapsed ? item.label : undefined}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className={`relative flex items-center rounded-[10px] text-[13.5px] font-medium transition-colors ${
              collapsed ? "h-10 justify-center px-0" : "gap-2.5 px-3 py-2.5"
            } ${active ? "bg-sidebar-hover text-white ring-1 ring-inset ring-white/10" : "text-slate-400 hover:bg-sidebar-hover hover:text-white"}`}
          >
            {item.icon}
            {!collapsed && <span className="flex-1">{item.label}</span>}
            {item.badge &&
              (collapsed ? (
                <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
              ) : (
                <span className="rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-bold text-white">{item.badge}</span>
              ))}
          </Link>
        );
      })}

      </nav>
      <div className="flex-1" />

      <div className={`flex items-center rounded-xl bg-sidebar-hover ${collapsed ? "justify-center p-2" : "gap-2.5 p-3"}`}>
        <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-slate-700 text-[12px] font-bold text-slate-200">
          PT
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-semibold text-slate-200">Área de trabalho</div>
            <div className="text-[10.5px] text-slate-500">Gestão de processos</div>
          </div>
        )}
      </div>
    </aside>
  );
}

function ChevronsIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={direction === "right" ? "rotate-180" : ""}
    >
      <path d="m11 17-5-5 5-5" /><path d="m18 17-5-5 5-5" />
    </svg>
  );
}
