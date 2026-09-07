import { cn } from '@/lib/utils';
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- SVG status preserves the component's SVG prop API. */
import { Loader2Icon } from 'lucide-react';

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <Loader2Icon
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  );
}

export { Spinner };
