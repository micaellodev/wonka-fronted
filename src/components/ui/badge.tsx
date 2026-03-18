import * as React from 'react'
import { cn } from '@/lib/utils'

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'danger'

const styles: Record<BadgeVariant, string> = {
    default: 'bg-primary text-primary-foreground border-primary/30',
    secondary: 'bg-secondary text-secondary-foreground border-border',
    outline: 'bg-transparent text-foreground border-border',
    success: 'bg-emerald-500/12 text-emerald-300 border-emerald-500/30',
    warning: 'bg-amber-500/12 text-amber-300 border-amber-500/30',
    danger: 'bg-red-500/12 text-red-300 border-red-500/30',
}

export function Badge({ className, variant = 'default', ...props }: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
    return (
        <span
            className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', styles[variant], className)}
            {...props}
        />
    )
}
