// SynTask v3.0 — Shared favorites state (tab sub-nav plan, D4).
// The Sidebar (Favorites shortcut list) and the SectionTabs bar (per-tab star toggle)
// read/write the SAME localStorage key. This hook centralises the state and broadcasts
// changes via a custom event + storage event so both stay in sync without polling.
import { useCallback, useEffect, useState } from "react";

const FAVORITES_KEY = "syntask-sidebar-favorites";
const FAVORITES_CHANGED_EVENT = "syntask:favorites-changed";

const readFavorites = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const useFavorites = () => {
  const [favorites, setFavorites] = useState(readFavorites);

  useEffect(() => {
    const sync = () => setFavorites(readFavorites());
    window.addEventListener(FAVORITES_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(FAVORITES_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggleFavorite = useCallback((href) => {
    setFavorites((current) => {
      const next = current.includes(href)
        ? current.filter((item) => item !== href)
        : [...current, href];
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch {
        // ignore (private mode / quota)
      }
      window.dispatchEvent(new CustomEvent(FAVORITES_CHANGED_EVENT, { detail: next }));
      return next;
    });
  }, []);

  const isFavorite = useCallback((href) => favorites.includes(href), [favorites]);

  return { favorites, toggleFavorite, isFavorite };
};
