"use client";

import { useEffect, useState } from "react";
import type { AssetManifest } from "./types";

/** Public URL of the build-time generated manifest. */
const MANIFEST_URL = "/assets/manifest.json";

type ManifestState =
  | { status: "loading"; manifest: null; error: null }
  | { status: "ready"; manifest: AssetManifest; error: null }
  | { status: "error"; manifest: null; error: string };

/** Fetch the asset manifest on the client (static-export friendly). */
export function useManifest(): ManifestState {
  const [state, setState] = useState<ManifestState>({
    status: "loading",
    manifest: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    fetch(MANIFEST_URL, { cache: "no-cache" })
      .then((res) => {
        if (!res.ok) throw new Error(`manifest ${res.status}`);
        return res.json() as Promise<AssetManifest>;
      })
      .then((manifest) => {
        if (!cancelled) setState({ status: "ready", manifest, error: null });
      })
      .catch((err) => {
        if (!cancelled)
          setState({ status: "error", manifest: null, error: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
