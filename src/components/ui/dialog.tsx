"use client"

import * as React from "react"
import { Dialog as P } from "@base-ui/react/dialog"
import { XIcon } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Base UI: Esc, focus trap, role=dialog, aria-modal, scroll lock built in.
const Dialog = P.Root
const DialogTrigger = P.Trigger
const DialogClose = P.Close

const sizes = cva(
 "fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-background p-6 text-foreground shadow-lg outline-none transition duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
 {
 variants: { size: { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg", xl: "max-w-2xl" } },
 defaultVariants: { size: "md" },
 }
)

function DialogContent({
 className,
 children,
 size,
 showCloseButton = true,
 ...props
}: P.Popup.Props & VariantProps<typeof sizes> & { showCloseButton?: boolean }) {
 return (
 <P.Portal>
 <P.Backdrop className="fixed inset-0 z-50 bg-scrim transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
 <P.Popup data-slot="dialog-content" className={cn(sizes({ size }), className)} {...props}>
 {children}
 {showCloseButton && (
 <P.Close
 aria-label="Cerrar"
 className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
 >
 <XIcon className="size-4" />
 </P.Close>
 )}
 </P.Popup>
 </P.Portal>
 )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
 return <div className={cn("flex flex-col gap-1.5 pr-6", className)} {...props} />
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
 return <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />
}

function DialogTitle({ className, ...props }: P.Title.Props) {
 return <P.Title className={cn("text-lg font-semibold leading-none", className)} {...props} />
}

function DialogDescription({ className, ...props }: P.Description.Props) {
 return <P.Description className={cn("text-sm text-muted-foreground", className)} {...props} />
}

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription }
