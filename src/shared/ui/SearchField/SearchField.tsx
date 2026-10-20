import React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

export interface SearchFieldProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'size'
> {
  shortcut?: string;
  onClear?: () => void;
  className?: string;
  iconClassName?: string;
}

export const SearchField: React.FC<SearchFieldProps> = ({
  placeholder = 'Search...',
  shortcut,
  value,
  onChange,
  className,
  iconClassName,
  ...props
}) => {
  return (
    <label
      className={cn(
        'sr-search flex h-[52px] min-w-[260px] cursor-text items-center gap-3 rounded-full p-1 pr-3.5 shadow-edge glass transition-colors focus-within:border-ring',
        className,
      )}
    >
      <span
        className={cn(
          'sr-search__icon flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm',
          iconClassName,
        )}
        aria-hidden="true"
      >
        <Search className="size-[18px]" />
      </span>
      <span className="sr-sr-only">Search</span>
      <input
        type="search"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="sr-search__input min-w-0 flex-1 border-none bg-transparent font-sans text-sm text-foreground outline-none placeholder:text-muted-foreground"
        {...props}
      />
      {shortcut && (
        <kbd className="sr-kbd shrink-0 rounded border border-border bg-muted px-2 py-1 font-mono text-[11px] leading-none text-muted-foreground select-none">
          {shortcut}
        </kbd>
      )}
    </label>
  );
};
