import { createClient } from "@supabase/supabase-js";

// Ensure variables are defined
// Valores con comillas/espacios sobrantes (p. ej. cargados por un script de shell) hacían caer el arranque: se limpian y, si no son http(s), el almacenamiento queda desactivado.
const clean = (v?: string) => (v ?? "").trim().replace(/^["']|["']$/g, "").trim();
const rawUrl = clean(process.env.SUPABASE_URL);
const supabaseUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : "";
const supabaseKey = clean(process.env.SUPABASE_KEY);
export const supabaseBucket = process.env.SUPABASE_BUCKET || "wonka_storage";

// createClient throws on an empty URL, which would crash the whole server at import time.
export const supabase = createClient(supabaseUrl || "http://localhost", supabaseKey || "unset");

/** Storage is down/misconfigured: the upload endpoint answers 503 with this message. */
export class StorageUnavailableError extends Error {}

/**
 * Uploads a file to the configured Supabase Storage bucket and returns the public URL.
 */
export async function uploadFileToStorage(file: File, folder: string = 'uploads'): Promise<string> {
    if (!supabaseUrl || !supabaseKey) {
        throw new StorageUnavailableError("Almacenamiento de imágenes no configurado (Supabase). Puedes guardar sin imagen.");
    }

    const arrayBuffer = await file.arrayBuffer();

    // Create a unique filename
    const ext = file.name.split('.').pop() || 'bin';
    const uniqueName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

    let result;
    try {
        result = await supabase.storage
            .from(supabaseBucket)
            .upload(uniqueName, arrayBuffer, {
                contentType: file.type || "application/octet-stream",
                upsert: false // Don't overwrite by default
            });
    } catch (err) {
        console.error("Supabase Upload Error:", err);
        throw new StorageUnavailableError("No se pudo conectar con el almacenamiento de imágenes. Intenta más tarde o guarda sin imagen.");
    }
    const { data, error } = result;

    if (error) {
        console.error("Supabase Upload Error:", error);
        throw new StorageUnavailableError(`El almacenamiento rechazó la imagen: ${error.message}`);
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
        .from(supabaseBucket)
        .getPublicUrl(data.path);

    return publicUrlData.publicUrl;
}
