"use client";

import { useCallback, useEffect, useState } from "react";

export type MicPermission = "unknown" | "granted" | "denied";

export function useMicDevices() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [permission, setPermission] = useState<MicPermission>("unknown");

  const refresh = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const mics = list.filter((d) => d.kind === "audioinput");
      setDevices(mics);
      // se algum device já tem label, a permissão foi concedida
      if (mics.some((m) => m.label)) setPermission("granted");
    } catch {
      // ignora
    }
  }, []);

  // Pede permissão de microfone (necessário para revelar os nomes e habilitar a captura).
  const requestPermission = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPermission("denied");
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setPermission("granted");
      await refresh();
      return true;
    } catch {
      setPermission("denied");
      return false;
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    md?.addEventListener?.("devicechange", refresh);
    return () => md?.removeEventListener?.("devicechange", refresh);
  }, [refresh]);

  return { devices, selectedId, setSelectedId, permission, requestPermission, refresh };
}
