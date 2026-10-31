import { Box, Database, Globe, Layers } from 'lucide-react';
import { serviceKind } from '@/features/services/components/ServiceCard/ServiceCard.config';

/** Icon per formula. A static switch, not a component picked at render time
 * (React Compiler `static-components`). */
export const ServiceIcon = ({ formula, className }: { formula: string; className?: string }) => {
  switch (serviceKind(formula)) {
    case 'cache':
      return <Layers className={className} />;
    case 'web':
      return <Globe className={className} />;
    case 'db':
      return <Database className={className} />;
    default:
      return <Box className={className} />;
  }
};
