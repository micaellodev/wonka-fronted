import * as React from 'react'
import { cn } from '@/lib/utils'

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'danger'

const styles: Record<BadgeVariant, string> = {
 default: 'bg-primary text-primary-foreground border-transparent',
 secondary: 'bg-info-soft text-info border-transparent',
 outline: 'bg-card text-foreground border-border',
 success: 'bg-success-soft text-success border-transparent',
 warning: 'bg-warning-soft text-warning border-transparent',
 danger: 'bg-danger-soft text-destructive border-transparent',
}

export function Badge({ className, variant = 'default', ...props }: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
 return (
 <span
 className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', styles[variant], className)}
 {...props}
 />
 )
}
