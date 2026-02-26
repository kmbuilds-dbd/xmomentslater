"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Sun, Moon, Monitor, LogOut } from "lucide-react";

const themeOrder = ["system", "light", "dark"] as const;

export function Navbar() {
  const router = useRouter();
  const supabase = createClient();
  const { theme, setTheme } = useTheme();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const cycleTheme = () => {
    const currentIndex = themeOrder.indexOf(
      theme as (typeof themeOrder)[number]
    );
    const nextIndex = (currentIndex + 1) % themeOrder.length;
    setTheme(themeOrder[nextIndex]);
  };

  const ThemeIcon =
    theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <header className="border-b px-6 py-4 flex items-center justify-between">
      <span className="font-[family-name:var(--font-fraunces)] text-lg font-semibold tracking-tight">
        xMomentsLater
      </span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={cycleTheme}>
          <ThemeIcon className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleSignOut}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
