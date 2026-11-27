import { Suspense, type ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";
import { logError } from "@amax/core/server";

type Props<T> = { what: string; retry: string; load: () => Promise<T>; children: (data: T) => ReactNode };

export const Skeleton = ({ what }: { what: string }) => (
  <div className="card dv-skel" aria-busy="true" aria-label={`Loading ${what}`}><span /><span /><span /></div>
);

export const LoadFailed = ({ what, retry }: { what: string; retry: string }) => (
  <div className="card dv-failed" role="alert"><p>Couldn&apos;t load {what}.</p><a className="btn sm" href={retry}>Try again</a></div>
);

export async function Loaded<T>({ what, retry, load, children }: Props<T>) {
  let data: T;
  try {
    data = await load();
  } catch (e) {
    unstable_rethrow(e);
    logError(`delivery.load ${what}`, e);
    return <LoadFailed what={what} retry={retry} />;
  }
  return <>{children(data)}</>;
}

export function LoadSafe<T>(props: Props<T>) {
  return <Suspense fallback={<Skeleton what={props.what} />}><Loaded {...props} /></Suspense>;
}
