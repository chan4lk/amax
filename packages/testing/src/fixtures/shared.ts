import type { SharedFixtures } from "@amax/core";

// The shared Lumen Labs data every module's fixtures build on. Source of truth:
// .specclaw/changes/archive/001-amax-foundation/fixtures.md. Keep the two in step.
export const lumen: SharedFixtures = {
  tenant: { id: "11111111-1111-4111-8111-111111111111", name: "Lumen Labs" },
  today: "2026-10-16",
  entities: [
    { id: "11111111-1111-4111-8111-1111111111a1", key: "lk", name: "Lumen Labs Lanka (Pvt) Ltd", country: "LK", baseCurrency: "LKR", headcount: 171 },
    { id: "11111111-1111-4111-8111-1111111111a2", key: "au", name: "Lumen Labs Pty Ltd", country: "AU", baseCurrency: "AUD", headcount: 13, timezone: "Australia/Sydney" },
  ],
  departments: { Engineering: 112, Quality: 24, Delivery: 14, Sales: 9, "People and Culture": 8, Finance: 6, IT: 6, Leadership: 5 },
  people: [
    { key: "maya", name: "Maya Fernando", initials: "MF", title: "Delivery manager", entity: "lk", roles: ["PM", "Leadership", "Admin"], status: "active" },
    { key: "nimal", name: "Nimal Silva", initials: "NS", title: "Tech lead", entity: "lk", roles: ["Engineer"], manager: "maya", status: "active" },
    { key: "kasun", name: "Kasun Dias", initials: "KD", title: "Senior engineer", entity: "lk", roles: ["Engineer"], manager: "maya", status: "active" },
    { key: "ayesha", name: "Ayesha Rahman", initials: "AR", title: "QA lead", entity: "lk", roles: ["Engineer"], manager: "maya", status: "active" },
    { key: "tharushi", name: "Tharushi Wijesinghe", initials: "TW", title: "Associate engineer", entity: "lk", roles: ["Engineer"], manager: "maya", status: "active", probationEnds: "2026-10-31" },
    { key: "dinesh", name: "Dinesh Wickrama", initials: "DW", title: "Software engineer", entity: "lk", roles: ["Engineer"], manager: "maya", status: "active", joined: "2026-10-05" },
    { key: "sarah", name: "Sarah Chen", initials: "SC", title: "Managing director, Australia", entity: "au", roles: ["Leadership"], status: "active" },
    { key: "liam", name: "Liam Murphy", initials: "LM", title: "Account director", entity: "au", roles: ["Sales"], manager: "sarah", status: "active" },
    { key: "sahan", name: "Sahan Kumara", initials: "SK", title: "IT, Global admin", entity: "lk", roles: ["Admin"], status: "active" },
    { key: "ravi", name: "Ravi Perera", initials: "RP", title: "IT administrator", entity: "lk", roles: ["ITAdmin"], manager: "sahan", status: "active" },
    { key: "rizwan", name: "Rizwan Farook", initials: "RF", title: "Software engineer", entity: "lk", roles: ["Employee"], status: "left", left: "2026-09-30" },
    { key: "rifkhan", name: "Mohamed Rifkhan", initials: "MR", title: "Software engineer", entity: "lk", roles: ["Employee"], status: "joining", joined: "2026-11-02" },
  ],
  projects: [
    { key: "CON", name: "Contoso Portal", client: "Contoso", manager: "maya", billing: "fixed", contractValue: "420000", invoiced: "231000", currency: "USD" },
    { key: "FLT", name: "Fleet Tracker", client: "Wide World Importers", manager: "nimal", billing: "t&m", contractValue: "210000", invoiced: "151200", currency: "USD" },
    { key: "HRI", name: "HR Insights", client: "Northwind HR", manager: "ayesha", billing: "retainer", contractValue: "144000", invoiced: "36000", currency: "USD" },
  ],
};
