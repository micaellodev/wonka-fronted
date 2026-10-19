/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
 "inline-flex items-center justify-center gap-2 rounded-md text-sm font-semibold whitespace-nowrap transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 active:scale-[0.97]",
 {
 variants: {
 variant: {
 default:
 "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
 outline:
 "border border-border bg-background text-foreground hover:bg-muted",
 secondary:
 "bg-muted text-foreground border border-border hover:bg-muted/60",
 ghost:
 "text-muted-foreground hover:bg-muted hover:text-foreground",
 destructive:
 "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
 success:
 "bg-success text-success-foreground hover:bg-success/90 shadow-sm",
 link:
 "text-primary underline-offset-4 hover:underline",
 },
 size: {
 default: "h-10 px-4 py-2",
 sm: "h-8 rounded-md px-3 text-xs",
 lg: "h-11 rounded-md px-8 text-base",
 xl: "h-14 rounded-lg px-8 text-base",
 icon: "h-10 w-10",
 },
 },
 defaultVariants: {
 variant: "default",
 size: "default",
 },
 }
)

const Button = React.forwardRef<
 HTMLButtonElement,
 React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>
>(({ className, variant, size, ...props }, ref) => {
 return <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
})
Button.displayName = "Button"

export { Button, buttonVariants }
