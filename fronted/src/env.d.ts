/// <reference types="vite/client" />

interface ImportMetaEnv {
 readonly VITE_API_URL: string
 readonly VITE_TENANT_ID: string
 readonly VITE_AVATAR_FALLBACK_SERVICE: string
 readonly VITE_APISPERU_URL: string
 readonly VITE_GOOGLE_FONTS_URL: string
}

interface ImportMeta {
 readonly env: ImportMetaEnv
}

interface UpdateStatus {
 state: 'downloading' | 'ready' | 'error'
 version?: string
 notes?: string
 percent?: number
}

interface ElectronAPI {
 minimize: () => void
 maximize: () => void
 close: () => void
 printSilent: (html: string) => void
 getVersion: () => Promise<string>
 onUpdateStatus: (cb: (s: UpdateStatus) => void) => () => void
 getUpdateStatus: () => Promise<UpdateStatus | null>
 installUpdate: () => void
}

interface Window {
 electronAPI?: ElectronAPI
}
