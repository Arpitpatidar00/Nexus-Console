import React from 'react';
import { Badge, type BadgeProps } from './Badge';

export type EnvironmentType =
  'dev' | 'staging' | 'prod' | 'production' | 'test' | 'local' | 'other' | string;

interface EnvConfig {
  variant: BadgeProps['variant'];
  label: string;
}

const ENV_MAP: Record<string, EnvConfig> = {
  dev: { variant: 'default', label: 'Dev' },
  local: { variant: 'default', label: 'Local' },
  test: { variant: 'default', label: 'Test' },
  staging: { variant: 'info', label: 'Staging' },
  prod: { variant: 'prod', label: 'PROD' },
  production: { variant: 'prod', label: 'PROD' },
  other: { variant: 'default', label: 'Other' },
};

export interface EnvBadgeProps {
  env: EnvironmentType;
  className?: string;
}

export const EnvBadge: React.FC<EnvBadgeProps> = ({ env, className }) => {
  const normalized = env.toLowerCase();
  const config = ENV_MAP[normalized] || { variant: 'default', label: env.toUpperCase() };

  return (
    <Badge
      variant={config.variant}
      dot={normalized === 'prod' || normalized === 'production'}
      className={className}
    >
      {config.label}
    </Badge>
  );
};
