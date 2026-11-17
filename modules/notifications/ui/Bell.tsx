import type { Viewer } from "@amax/auth";
import { Icon } from "@amax/ui";
import { inbox } from "../server/read";
import { BellMenu } from "./BellMenu";
import "./notifications.css";

/** The top bar's bell (030 AC-6). The guest preview keeps the plain icon. */
export async function Bell({ viewer }: { viewer: unknown }) {
  const v = viewer as Viewer | null;
  if (!v) return <button className="iconbtn" type="button" aria-label="Notifications"><Icon name="bell" /></button>;
  return <BellMenu initial={await inbox(v, 20, true)} now={Date.now()} />;
}
