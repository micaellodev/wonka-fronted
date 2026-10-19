// Eden treaty error -> user message. Replaces the local copies.
export function apiErrorMessage(e: unknown, fallback = 'No se pudo conectar con el servidor.'): string {
 const err = e as { value?: { message?: string; error?: string }; message?: string } | null
 return err?.value?.message ?? err?.value?.error ?? (err instanceof Error ? err.message : undefined) ?? fallback
}
