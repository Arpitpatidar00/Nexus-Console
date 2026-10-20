// Stackroost components — types as documentation. window.Stackroost.<Name>
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, CSSProperties } from 'react';

export type IconName =
  | 'home'
  | 'activity'
  | 'package'
  | 'clock'
  | 'plug'
  | 'server'
  | 'terminal'
  | 'shield'
  | 'drive'
  | 'cpu'
  | 'message'
  | 'settings'
  | 'search'
  | 'bell'
  | 'plus'
  | 'chevron'
  | 'play'
  | 'stop'
  | 'restart'
  | 'x'
  | 'check'
  | 'containers'
  | 'database'
  | 'globe'
  | 'key'
  | 'zap'
  | 'tunnel'
  | 'sparkles'
  | 'command'
  | 'more'
  | 'cloud'
  | 'folder'
  | 'list'
  | 'menu'
  | 'upload';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'ember';

export interface LogoProps {
  /** Mark height in px; the wordmark scales with it. */ size?: number;
  markOnly?: boolean;
  className?: string;
}
export interface MarkProps {
  size?: number;
  label?: string;
  className?: string;
}
export interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  /** Accessible name; omit for decorative. */ label?: string;
  className?: string;
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ember' | 'glass' | 'ghost' | 'outline' | 'destructive';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  icon?: IconName;
  iconRight?: IconName;
}

export interface BadgeProps {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}
export interface EnvBadgeProps {
  env: 'dev' | 'staging' | 'prod' | 'other';
}

export interface PanelProps {
  variant?: 'glass' | 'solid' | 'inverse';
  title?: ReactNode;
  subtitle?: ReactNode;
  /** A small element top-right, usually a glass Button. */
  action?: ReactNode;
  /** Shorthand for `action`: renders a small glass Button (ember on inverse) with this label. */
  actionLabel?: string;
  actionIcon?: IconName;
  onAction?: () => void;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export interface MetricProps {
  value: ReactNode;
  unit?: string;
  label: string;
  tone?: Tone;
  /** 0–100 underline. */
  progress?: number;
  spark?: number[];
  sparkTone?: SparklineProps['tone'];
}

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  tone?: 'ember' | 'ivory' | 'lime' | 'info';
  area?: boolean;
  marker?: boolean;
  /** Accessible name. */
  label?: string;
}

export interface ProgressProps {
  value: number;
  label?: string;
  valueText?: string;
  tone?: 'ember' | 'ivory' | 'success' | 'warning' | 'danger';
}

export type Option = string | { value: string; label: string };
export interface SegmentedProps {
  options: Option[];
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  label?: string;
}
export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  mono?: boolean;
}
export interface SearchFieldProps {
  placeholder?: string;
  shortcut?: string;
  label?: string;
  defaultValue?: string;
}

export interface NavItem {
  id: string;
  icon: IconName;
  label: string;
  badge?: boolean;
}
export interface NavRailProps {
  items: NavItem[];
  footer?: NavItem[];
  active?: string;
  onSelect?: (id: string) => void;
  logo?: boolean;
  label?: string;
}

export interface ListRowProps {
  icon?: IconName;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  status?: ReactNode;
  trailing?: ReactNode;
  /** Rendered between status and trailing: badges or buttons passed as children. */
  children?: ReactNode;
  className?: string;
}

export interface DialogSurfaceProps {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}

export interface MenuItem {
  label?: string;
  icon?: IconName;
  shortcut?: string;
  danger?: boolean;
  separator?: boolean;
  onSelect?: () => void;
}
export interface MenuProps {
  items: MenuItem[];
  label?: string;
}

export interface TooltipProps {
  label: string;
  side?: 'top' | 'right';
  open?: boolean;
  children: ReactNode;
}

export interface DialItem {
  id: string;
  icon: IconName;
  label: string;
}
export interface CommandDialProps {
  items: DialItem[];
  active?: string;
  onSelect?: (id: string) => void;
  onKnob?: () => void;
  showList?: boolean;
  label?: string;
  knobLabel?: string;
}
