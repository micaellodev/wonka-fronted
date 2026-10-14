import Elysia, { t } from "elysia";
import { uploadFileToStorage, StorageUnavailableError } from "../../lib/storage.ts";

// ============================================================
//  Upload Controller — Prefix: /upload
// ============================================================

// Known folders actually used by the frontend (avatars, product/category
// images). The `folder` value is concatenated directly into the storage
// object key, so it must be restricted to this allowlist — otherwise a
// caller could inject arbitrary path prefixes (e.g. "..").
const ALLOWED_UPLOAD_FOLDERS = ["avatars", "products", "categories", "general"] as const;
type AllowedUploadFolder = (typeof ALLOWED_UPLOAD_FOLDERS)[number];

export const uploadController = new Elysia({ prefix: "/upload", tags: ["Uploads"] })

    // ── POST /upload ──────────────────────────────────────────
    .post(
        "/",
        async ({ body, set }) => {
            try {
                // tenantId is collected just for logging or structuring if needed
                const { file, folder } = body;

                // Folder defaults to "general" and must be one of the allowed values
                // (validated by the schema below), so this is always safe to use as-is.
                const targetFolder: AllowedUploadFolder = folder || "general";

                const url = await uploadFileToStorage(file, targetFolder);

                set.status = 201;
                return {
                    data: { url },
                    meta: { message: "File uploaded successfully." }
                };
            } catch (err) {
                if (err instanceof StorageUnavailableError) {
                    set.status = 503;
                    return { message: err.message };
                }
                console.error("[upload]", err);
                set.status = 500;
                return { message: "No se pudo subir la imagen." };
            }
        },
        {
            body: t.Object({
                tenantId: t.String({ minLength: 1 }),
                // Max 5MB, images only (covers product/category images and avatars).
                file: t.File({ type: ["image/jpeg", "image/png", "image/webp"], maxSize: "5m" }),
                folder: t.Optional(t.UnionEnum(ALLOWED_UPLOAD_FOLDERS)),
            }),
            detail: {
                summary: "Upload a file to the Supabase Storage bucket",
                description: "Accepts multipart/form-data. Returns the public URL of the uploaded file. " +
                    "Max 5MB; JPEG/PNG/WebP only; folder restricted to a known allowlist."
            }
        }
    );
