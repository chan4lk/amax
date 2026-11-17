import { groupLabel, type Group } from "../server/roster";
import { groupHref } from "./href";

export { groupHref };

export function GroupSwitch({ group, params }: { group: Group; params?: Record<string, string | undefined> }) {
  return (
    <nav className="gswitch" aria-label="Whose people to show">
      {(["mine", "everyone"] as const).map((g) => (
        <a key={g} href={groupHref(g, params)} className={g === group ? "on" : undefined} aria-current={g === group ? "page" : undefined}>{groupLabel(g)}</a>
      ))}
    </nav>
  );
}
