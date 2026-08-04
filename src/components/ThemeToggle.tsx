"use client";

import { useEffect, useState } from "react";
import { applyTheme, loadTheme, type Theme } from "@/lib/session";
import { MoonIcon, SunIcon } from "./icons";
import { IconButton } from "./ui";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  // The class is already correct (set by the bootstrap script) — this only
  // syncs React's copy of it after hydration.
  useEffect(() => setTheme(loadTheme()), []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  };

  return (
    <IconButton label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} onClick={toggle}>
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </IconButton>
  );
}
