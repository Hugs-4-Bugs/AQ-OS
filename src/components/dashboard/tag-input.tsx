'use client';

import React, { useState, useRef, useCallback } from 'react';
import { X, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const SUGGESTED_TAGS = [
  'Hot Lead',
  'VIP',
  'Follow-up',
  'Cold',
  'Warm',
  'Priority',
  'Urgent',
  'Enterprise',
  'SMB',
  'Startup',
  'Local Business',
  'Franchise',
  'Chain',
  'Online Only',
  'Referral',
];

const TAG_COLORS = [
  { bg: 'bg-rose-500/15', text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-500/25' },
  { bg: 'bg-amber-500/15', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/25' },
  { bg: 'bg-emerald-500/15', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/25' },
  { bg: 'bg-sky-500/15', text: 'text-sky-600 dark:text-sky-400', border: 'border-sky-500/25' },
  { bg: 'bg-violet-500/15', text: 'text-violet-600 dark:text-violet-400', border: 'border-violet-500/25' },
  { bg: 'bg-pink-500/15', text: 'text-pink-600 dark:text-pink-400', border: 'border-pink-500/25' },
  { bg: 'bg-cyan-500/15', text: 'text-cyan-600 dark:text-cyan-400', border: 'border-cyan-500/25' },
  { bg: 'bg-orange-500/15', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-500/25' },
  { bg: 'bg-teal-500/15', text: 'text-teal-600 dark:text-teal-400', border: 'border-teal-500/25' },
  { bg: 'bg-indigo-500/15', text: 'text-indigo-600 dark:text-indigo-400', border: 'border-indigo-500/25' },
];

function getTagColor(tag: string) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % TAG_COLORS.length;
  return TAG_COLORS[index];
}

export function getTagColorClass(tag: string) {
  return getTagColor(tag);
}

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  maxTags?: number;
  disabled?: boolean;
}

export default function TagInput({ tags, onChange, maxTags = 8, disabled = false }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = useCallback((tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    if (tags.length >= maxTags) return;
    if (tags.some(t => t.toLowerCase() === trimmed.toLowerCase())) return;
    onChange([...tags, trimmed]);
    setInputValue('');
    setSuggestionsOpen(false);
  }, [tags, onChange, maxTags]);

  const removeTag = useCallback((tagToRemove: string) => {
    onChange(tags.filter(t => t !== tagToRemove));
  }, [tags, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }, [addTag, removeTag, inputValue, tags]);

  const filteredSuggestions = SUGGESTED_TAGS.filter(
    s => !tags.some(t => t.toLowerCase() === s.toLowerCase()) &&
    (inputValue ? s.toLowerCase().includes(inputValue.toLowerCase()) : true)
  );

  const isAtMax = tags.length >= maxTags;

  return (
    <div className="space-y-2">
      {/* Existing tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => {
            const color = getTagColor(tag);
            return (
              <Badge
                key={tag}
                variant="outline"
                className={cn(
                  'text-xs px-2 py-0.5 gap-1 font-medium border',
                  color.bg,
                  color.text,
                  color.border
                )}
              >
                {tag}
                {!disabled && (
                  <button
                    onClick={() => removeTag(tag)}
                    className="ml-0.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-full p-0.5 transition-colors"
                    aria-label={`Remove tag ${tag}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </Badge>
            );
          })}
        </div>
      )}

      {/* Input with suggestions */}
      {!disabled && !isAtMax && (
        <div className="flex items-center gap-1.5">
          <Popover open={suggestionsOpen && filteredSuggestions.length > 0} onOpenChange={setSuggestionsOpen}>
            <PopoverTrigger asChild>
              <div className="relative flex-1">
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    setSuggestionsOpen(true);
                  }}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setSuggestionsOpen(true)}
                  placeholder={tags.length === 0 ? 'Add tags...' : 'Add another...'}
                  className="h-8 text-xs border-primary/20 focus-visible:ring-primary/30"
                />
              </div>
            </PopoverTrigger>
            <PopoverContent
              className="w-56 p-2"
              align="start"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <div className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide px-1 mb-1">
                  Suggested Tags
                </p>
                <div className="flex flex-wrap gap-1">
                  {filteredSuggestions.map((suggestion) => {
                    const color = getTagColor(suggestion);
                    return (
                      <button
                        key={suggestion}
                        onClick={() => addTag(suggestion)}
                        className={cn(
                          'text-[11px] px-2 py-1 rounded-md border transition-colors',
                          color.bg,
                          color.text,
                          color.border,
                          'hover:opacity-80'
                        )}
                      >
                        {suggestion}
                      </button>
                    );
                  })}
                </div>
                {inputValue.trim() && !SUGGESTED_TAGS.some(s => s.toLowerCase() === inputValue.trim().toLowerCase()) && (
                  <div className="mt-2 pt-2 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-full justify-start gap-1.5 text-xs"
                      onClick={() => addTag(inputValue)}
                    >
                      <Plus className="h-3 w-3" />
                      Create &quot;{inputValue.trim()}&quot;
                    </Button>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs border-primary/20 hover:border-primary/40"
            onClick={() => addTag(inputValue)}
            disabled={!inputValue.trim() || isAtMax}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Max tags indicator */}
      {isAtMax && (
        <p className="text-[10px] text-muted-foreground">Maximum {maxTags} tags reached</p>
      )}
      {!isAtMax && tags.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {tags.length}/{maxTags} tags · Press Enter or comma to add
        </p>
      )}
    </div>
  );
}
