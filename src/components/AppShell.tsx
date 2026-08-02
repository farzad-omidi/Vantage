"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { initials } from "@/lib/format";
import {
  AlertsIcon,
  BellIcon,
  DashboardIcon,
  DiscoveryIcon,
  KnowledgeIcon,
  SearchIcon,
  SettingsIcon,
  SourcesIcon,
  TopicsIcon,
} from "@/components/icons";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: DashboardIcon },
  { href: "/alerts", label: "Alerts", icon: AlertsIcon },
  { href: "/sources", label: "Sources", icon: SourcesIcon },
  { href: "/topics", label: "Topics", icon: TopicsIcon },
  { href: "/discovery", label: "Discovery", icon: DiscoveryIcon },
  { href: "/knowledge", label: "Knowledge", icon: KnowledgeIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export function AppShell({
  children,
  email,
  displayName,
  unreadAlerts = 0,
}: {
  children: ReactNode;
  email: string;
  displayName: string | null;
  unreadAlerts?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const name = displayName || email.split("@")[0];

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-mark">V</span>
          Vantage
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={`sidebar-link${active ? " active" : ""}`}>
                <Icon size={17} />
                {item.label}
                {item.href === "/alerts" && unreadAlerts > 0 && (
                  <span
                    style={{
                      marginLeft: "auto",
                      background: "var(--urgent)",
                      color: "#fff",
                      borderRadius: 999,
                      fontSize: 10.5,
                      fontWeight: 700,
                      padding: "1px 6px",
                      minWidth: 18,
                      textAlign: "center",
                    }}
                  >
                    {unreadAlerts > 99 ? "99+" : unreadAlerts}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="row"
              style={{
                width: "100%",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 6,
                borderRadius: "var(--r-md)",
                textAlign: "left",
              }}
            >
              <div className="avatar" style={{ width: 30, height: 30, fontSize: 11.5 }}>
                {initials(name)}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {name}
                </div>
                <div className="mini" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {email}
                </div>
              </div>
            </button>
            {menuOpen && (
              <div
                className="card"
                style={{
                  position: "absolute",
                  bottom: "calc(100% + 6px)",
                  left: 0,
                  right: 0,
                  padding: 6,
                  zIndex: 20,
                }}
              >
                <button
                  onClick={handleSignOut}
                  className="ghost"
                  style={{ width: "100%", border: "none", justifyContent: "flex-start" }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>
      <div className="main-col">
        <header className="topbar">
          <div className="row" style={{ flex: 1, maxWidth: 420 }}>
            <SearchIcon size={16} className="mini" />
            <form action="/search" style={{ flex: 1 }}>
              <input
                name="q"
                className="input"
                placeholder="Search content, sources, topics…"
                style={{ border: "none", background: "transparent", padding: "6px 0" }}
              />
            </form>
          </div>
          <Link href="/alerts" className="icon-btn" style={{ position: "relative" }}>
            <BellIcon size={18} />
            {unreadAlerts > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: 5,
                  right: 5,
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--urgent)",
                  border: "2px solid var(--surface)",
                }}
              />
            )}
          </Link>
        </header>
        <main style={{ flex: 1 }}>{children}</main>
      </div>
    </div>
  );
}
