'use client';

import React from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
  size?: 'sm' | 'default';
}

export function ThemeToggle({ className, size = 'default' }: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === 'dark';

  const handleToggle = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  // Prevent hydration mismatch — render a placeholder until mounted
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          'shrink-0',
          size === 'sm' ? 'h-8 w-8' : 'h-9 w-9',
          className
        )}
        disabled
      >
        <span className="sr-only">Toggle theme</span>
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        'shrink-0 group relative overflow-hidden',
        size === 'sm' ? 'h-8 w-8' : 'h-9 w-9',
        className
      )}
      onClick={handleToggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span
        className={cn(
          'absolute inset-0 flex items-center justify-center transition-all duration-500',
          isDark
            ? 'rotate-0 scale-100 opacity-100'
            : 'rotate-90 scale-0 opacity-0'
        )}
      >
        <Sun
          className={cn(
            'text-amber-400 transition-transform duration-500 group-hover:rotate-45',
            size === 'sm' ? 'h-4 w-4' : 'h-[1.2rem] w-[1.2rem]'
          )}
        />
      </span>
      <span
        className={cn(
          'absolute inset-0 flex items-center justify-center transition-all duration-500',
          isDark
            ? '-rotate-90 scale-0 opacity-0'
            : 'rotate-0 scale-100 opacity-100'
        )}
      >
        <Moon
          className={cn(
            'text-primary transition-transform duration-500 group-hover:-rotate-12',
            size === 'sm' ? 'h-4 w-4' : 'h-[1.2rem] w-[1.2rem]'
          )}
        />
      </span>
      <span className="sr-only">
        {isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      </span>
    </Button>
  );
}

export default ThemeToggle;
