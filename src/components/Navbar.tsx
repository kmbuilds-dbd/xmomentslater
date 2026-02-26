"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Sun, Moon, Monitor, LogOut, Settings, BookOpen } from "lucide-react";

const themeOrder = ["system", "light", "dark"] as const;

export function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
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

  const isSettings = pathname === "/dashboard/settings";

  return (
    <header className="border-b px-6 py-4 flex items-center justify-between">
      <Link
        href="/dashboard"
        className="font-[family-name:var(--font-fraunces)] text-lg font-semibold tracking-tight hover:opacity-80 transition-opacity"
      >
        xMomentsLater
      </Link>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" asChild>
          <Link href={isSettings ? "/dashboard" : "/dashboard/settings"}>
            {isSettings ? (
              <BookOpen className="h-4 w-4" />
            ) : (
              <Settings className="h-4 w-4" />
            )}
          </Link>
        </Button>
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
