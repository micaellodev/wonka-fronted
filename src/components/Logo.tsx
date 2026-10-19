// ============================================================
// Logo — Renzo Wonka brand assets
// Expects:
// /logo.webp → full horizontal logo
// /icon.webp → icon/mark only
// ============================================================

interface LogoProps {
 variant?: 'full' | 'icon'
 className?: string
}

export function Logo({ variant = 'full', className = '' }: LogoProps) {
 const src = variant === 'icon' ? '/icon.webp' : '/logo.webp'
 const alt = variant === 'icon' ? 'Renzo Wonka icono' : 'Renzo Wonka'

 return (
 <img
 src={src}
 alt={alt}
 className={`object-contain ${className}`}
 onError={(e) => {
 // Fallback: hide broken image so layout doesn't break while assets are uploaded
 e.currentTarget.style.display = 'none'
 }}
 />
 )
}
