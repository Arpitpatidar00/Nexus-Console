import { cva, type VariantProps } from 'class-variance-authority';

export const buttonStyles = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-[background-color,color,transform,box-shadow] duration-150 active:scale-[.98] disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:size-[18px] [&_svg]:shrink-0 cursor-pointer select-none',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        ember: 'bg-ember text-ember-foreground hover:bg-ember/90 shadow-sm',
        secondary: 'glass text-secondary-foreground hover:bg-glass-strong',
        glass: 'glass text-secondary-foreground hover:bg-glass-strong',
        outline: 'border border-input bg-transparent hover:bg-accent text-fg',
        ghost: 'hover:bg-accent hover:text-accent-foreground text-fg',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        link: 'text-ember-text underline-offset-4 hover:underline',
        primaryOutline: 'border border-ember text-ember-text hover:bg-ember-soft',
        dangerOutline: 'border border-destructive text-destructive hover:bg-danger-soft',
        dangerGhost: 'text-muted-foreground hover:bg-danger-soft hover:text-destructive',
      },
      size: {
        default: 'h-10 px-[18px]',
        md: 'h-10 px-[18px]',
        sm: 'h-8 px-3.5 text-[13px] [&_svg]:size-4',
        lg: 'h-12 px-6 text-[15px]',
        icon: 'size-11 [&_svg]:size-5 p-0',
        iconSm: 'size-8 [&_svg]:size-4 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export type ButtonVariants = VariantProps<typeof buttonStyles>;
