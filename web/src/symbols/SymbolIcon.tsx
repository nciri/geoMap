import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSymbolIcon } from "../api/geomap";
import { errorMessage } from "../api/client";
import { Alert } from "../ui/components";

export function SymbolIcon({
  sidc,
  modifiers,
  alt,
}: {
  sidc: string;
  modifiers: Record<string, string>;
  alt: string;
}) {
  const icon = useQuery({
    queryKey: ["icon", sidc, modifiers],
    queryFn: () => fetchSymbolIcon(sidc, modifiers),
    staleTime: Infinity,
  });
  const url = useMemo(() => (icon.data ? URL.createObjectURL(icon.data.blob) : null), [icon.data]);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  if (icon.error) return <Alert severity="error" title={errorMessage(icon.error)} />;
  return url ? <img className="symbol-icon" src={url} alt={alt} /> : null;
}
