import { useState } from "react";
import { desktopApi, useMountEffect } from "@/lib";

export function useSystemFontFamilies(): string[] | null {
  const [families, setFamilies] = useState<string[] | null>(null);

  useMountEffect(() => {
    let cancelled = false;
    void desktopApi
      .listFontFamilies()
      .then((list) => {
        if (!cancelled) {
          setFamilies(Array.isArray(list) ? list : []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFamilies([]);
        }
      });
    return () => {
      cancelled = true;
    };
  });

  return families;
}
