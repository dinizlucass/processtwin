"use client";
import { useSyncExternalStore } from "react";
const eventName = "processtwin-panel-preference";
function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(eventName, notify);
  return () => { window.removeEventListener("storage", notify); window.removeEventListener(eventName, notify); };
}
export function usePanelPreference(key: string): [boolean | null, (value: boolean) => void] {
  const value = useSyncExternalStore(subscribe, () => {
    try { const stored = localStorage.getItem(key); return stored === null ? null : stored === "1"; } catch { return null; }
  }, () => null);
  return [value, (next) => {
    try { localStorage.setItem(key, next ? "1" : "0"); } catch { return; }
    window.dispatchEvent(new Event(eventName));
  }];
}
