"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { applyTheme, readTheme, type ThemeChoice } from "./theme";

const THEMES: ThemeChoice[] = ["system", "light", "dark"];
export const VIEW_ROLES = ["Admin", "ITAdmin", "Leadership", "PM", "HR", "Payroll", "Finance", "Engineer", "Employee"] as const;

export type Profile = {
  /** 070 AC-53: the user this page was rendered for; actions send it so a switched session is refused. */
  userId: string;
  name: string;
  initials: string;
  /** What the chip shows: the View-as role, else the primary role. */
  chip: string;
  subtitle: string;
  canViewAs: boolean;
  /** May open Settings right now (Admin or IT Admin; View as another role turns this off, matching what the settings pages allow). */
  isAdmin: boolean;
  viewAs?: string;
};

export type MenuLink = { href: string; label: string };

type Props = {
  profile: Profile | null;
  links?: MenuLink[];
  onViewAs?: (role: string | null) => Promise<void>;
  onSignOut?: () => Promise<void>;
};

export function ProfileMenu({ profile, onViewAs, onSignOut, links = [] }: Props) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>("system");
  const [, start] = useTransition();
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => setTheme(readTheme()), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (setOpen(false), button.current?.focus());
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  const choose = (t: ThemeChoice) => (applyTheme(t), setTheme(t));
  const viewing = profile?.viewAs ?? "Admin";
  const label = profile ? `${profile.name}, ${profile.chip}, profile menu` : "Guest, profile and theme";
  return (
    <div className="mewrap">
      <button ref={button} className="me" type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="av" aria-hidden="true">{profile?.initials ?? "G"}</span>
        {profile ? (
          <div>{profile.name} <span className="chip agent view-chip">{profile.chip}</span><small>{profile.subtitle}</small></div>
        ) : (
          <div>Guest<small>Preview without sign-in</small></div>
        )}
      </button>
      {open && (
        <div className="menu" role="menu" aria-label="Profile">
          {profile?.canViewAs && onViewAs && (
            <>
              <div className="menu-lbl" id="ml-view">View as</div>
              <div role="group" aria-labelledby="ml-view">
                {VIEW_ROLES.map((r) => (
                  <button key={r} type="button" role="menuitemradio" aria-checked={viewing === r}
                    onClick={() => (setOpen(false), start(() => onViewAs(r === "Admin" ? null : r)))}>{r === "ITAdmin" ? "IT Admin" : r}</button>
                ))}
              </div>
              <div className="menu-sep" role="separator" />
            </>
          )}
          <div className="menu-lbl" id="ml-theme">Theme</div>
          <div role="group" aria-labelledby="ml-theme">
            {THEMES.map((t) => (
              <button key={t} type="button" role="menuitemradio" aria-checked={theme === t} onClick={() => choose(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
          {profile && links.length > 0 && (
            <>
              <div className="menu-sep" role="separator" />
              {links.map((l) => <a key={l.href} role="menuitem" href={l.href} style={{ display: "block", padding: "8px 12px", borderRadius: 10, fontSize: 14, color: "inherit", textDecoration: "none" }}>{l.label}</a>)}
            </>
          )}
          {profile?.isAdmin && (
            <>
              <div className="menu-sep" role="separator" />
              <a role="menuitem" href="/settings" style={{ display: "block", padding: "8px 12px", borderRadius: 10, fontSize: 14, color: "inherit", textDecoration: "none", fontWeight: 600 }}>Settings</a>
              <a role="menuitem" href="/settings/ai" style={{ display: "block", padding: "8px 12px", borderRadius: 10, fontSize: 14, color: "inherit", textDecoration: "none" }}>AI and data settings</a>
              <a role="menuitem" href="/settings/integrations" style={{ display: "block", padding: "8px 12px", borderRadius: 10, fontSize: 14, color: "inherit", textDecoration: "none" }}>Integrations</a>
              <a role="menuitem" href="/settings/keys" style={{ display: "block", padding: "8px 12px", borderRadius: 10, fontSize: 14, color: "inherit", textDecoration: "none" }}>Connections and keys</a>
              <a role="menuitem" href="/settings/workflows" style={{ display: "block", padding: "8px 12px", borderRadius: 10, fontSize: 14, color: "inherit", textDecoration: "none" }}>Scheduler and runs</a>
              <a role="menuitem" href="/settings/audit" style={{ display: "block", padding: "8px 12px", borderRadius: 10, fontSize: 14, color: "inherit", textDecoration: "none" }}>Audit and trace</a>
            </>
          )}
          {profile && onSignOut && (
            <>
              <div className="menu-sep" role="separator" />
              <button type="button" role="menuitem" onClick={() => start(() => onSignOut())}>Sign out</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
