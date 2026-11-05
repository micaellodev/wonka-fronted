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

interface PrintResult { ok: boolean; error?: string }
interface PrinterInfo { name: string; displayName: string; isDefault: boolean; online: boolean; problem: string | null }
interface PrintConfig { printer: string; paper: 'A4' | 'A5' | '80mm' | '58mm' }

interface ElectronAPI {
 minimize: () => void
 maximize: () => void
 close: () => void
 printSilent: (html: string) => Promise<PrintResult>
 listPrinters: () => Promise<PrinterInfo[]>
 getPrintConfig: () => Promise<PrintConfig>
 setPrintConfig: (cfg: PrintConfig) => Promise<PrintConfig>
 printTest: () => Promise<PrintResult>
 getVersion: () => Promise<string>
 onUpdateStatus: (cb: (s: UpdateStatus) => void) => () => void
 getUpdateStatus: () => Promise<UpdateStatus | null>
 installUpdate: () => void
}

interface Window {
 electronAPI?: ElectronAPI
}
