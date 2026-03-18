import * as React from 'react'
import { cn } from '@/lib/utils'

export function Tabs({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={cn('w-full', className)} {...props} />
}

export function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={cn('inline-flex h-10 items-center rounded-md border border-border bg-muted p-1 text-muted-foreground', className)} {...props} />
}

export function TabsTrigger({
    className,
    active,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
    return (
        <button
            className={cn(
                'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all',
                active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                className
            )}
            {...props}
        />
    )
}

export function TabsContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={cn('mt-5', className)} {...props} />
}
