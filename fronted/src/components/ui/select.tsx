import * as React from "react"

import { cn } from "@/lib/utils"

const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
 ({ className, ...props }, ref) => (
 <select ref={ref} className={cn("flex w-full rounded-md border border-border bg-background px-3 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/30 h-10 py-2", className)} {...props} />
 )
)
Select.displayName = "Select"

export { Select }
