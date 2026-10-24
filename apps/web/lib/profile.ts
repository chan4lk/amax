import { can, roleLabel, rolesOf, type Viewer } from "@amax/auth";
import type { NavItem } from "@amax/ui";
import { seesSettings } from "./admin/status";
import type { Profile } from "../components/shell/ProfileMenu";

const ORDER = ["Admin", "ITAdmin", "Leadership", "PM", "HR", "Payroll", "Finance", "Sales", "Engineer", "Employee"];

export function profileOf(v: Viewer): Profile {
  const primary = [...v.actualRoles].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))[0] ?? "Employee";
  return {
    userId: v.userId,
    name: v.name,
    initials: v.name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase(),
    chip: roleLabel(v.viewAs ?? primary),
    subtitle: v.actualRoles.map(roleLabel).join(" · "),
    canViewAs: v.actualRoles.includes("Admin"),
    // The settings screens' own permission, so IT Admin (055) gets the links and a View-as preview doesn't.
    isAdmin: can(v, "settings:read"),
    viewAs: v.viewAs,
  };
}

// The mock's wording: what a preview hides.
export function viewBanner(v: Viewer): string | null {
  if (!v.viewAs || v.viewAs === "Admin") return null;
  if (v.viewAs === "ITAdmin") return "Viewing as IT Admin: prices are hidden.";
  return v.viewAs === "Payroll" ? "Viewing as Payroll: screens outside payroll are hidden." : `Viewing as ${v.viewAs}: pay, payroll and admin screens are hidden.`;
}

// Overview stays; each module's nav entry needs "<id>:read" for one of the effective roles. A hub
// (038's Settings) shows when any screen behind it would let the viewer in.
export const visibleNav = (items: NavItem[], v: Viewer) =>
  items.filter((i) => i.href === "/" || (i.hub ? seesSettings(v) : can(v, i.permission ?? `${i.href.split("/")[1]}:read`)));

export const hasAnyRole = (v: Viewer) => rolesOf(v).length > 0;
