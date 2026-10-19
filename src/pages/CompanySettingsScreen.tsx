import { useEffect, useState } from 'react'
import { Save, Building2, AlertCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { PinPad } from '@/components/PinPad'

// ============================================================
// CompanySettingsScreen — Fiscal + APISPeru configuration
// ============================================================

interface TenantSettings {
 id: string
 name: string
 slug: string
 ruc: string | null
 razonSocial: string | null
 nombreComercial: string | null
 direccion: string | null
 ubigeo: string | null
 receiptFooter: string | null
 hasApisperuToken: boolean
 apisperuUrl: string | null
 igvRate: number
 defaultIgvRegime: string
 pricesIncludeIgv: boolean
 electronicInvoicingEnabled: boolean
 serieBoleta: string
 serieFactura: string
 serieNotaCredito: string
 serieNotaDebito: string
}

const DEFAULT_APISPERU_URL = import.meta.env.VITE_APISPERU_URL || 'https://facturacion.apisperu.com/api/v1'

const emptySettings: TenantSettings = {
 id: '',
 name: '',
 slug: '',
 ruc: '',
 razonSocial: '',
 nombreComercial: '',
 direccion: '',
 ubigeo: '',
 receiptFooter: '',
 hasApisperuToken: false,
 apisperuUrl: DEFAULT_APISPERU_URL,
 igvRate: 18,
 defaultIgvRegime: 'EXONERADO',
 pricesIncludeIgv: false,
 electronicInvoicingEnabled: false,
 serieBoleta: 'B001',
 serieFactura: 'F001',
 serieNotaCredito: 'BC01',
 serieNotaDebito: 'BD01',
}

export function CompanySettingsScreen() {
 const { tenantId } = useAuthStore()
 const [settings, setSettings] = useState<TenantSettings>(emptySettings)
 const [apisperuTokenInput, setApisperuTokenInput] = useState('')
 const [loading, setLoading] = useState(true)
 const [saving, setSaving] = useState(false)
 const [loadFailed, setLoadFailed] = useState(false)
 const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
 const [showAdminPinModal, setShowAdminPinModal] = useState(false)
 const [adminPinError, setAdminPinError] = useState(false)

 useEffect(() => {
 const fetchTenant = async () => {
 try {
 const { data, error } = await api.dashboard.settings.get({
 query: { tenantId },
 })
 if (error) throw error
 if (data?.data) {
 setSettings({ ...emptySettings, ...(data.data as TenantSettings) })
 }
 } catch (err) {
 console.error('Failed to load tenant settings:', err)
 setLoadFailed(true)
 setMessage({ type: 'error', text: 'Error al cargar la configuración.' })
 } finally {
 setLoading(false)
 }
 }

 fetchTenant()
 }, [tenantId])

 const handleChange = (field: keyof TenantSettings, value: string | number | boolean) => {
 setSettings((prev) => ({ ...prev, [field]: value }))
 }

 const handleSave = () => {
 setMessage(null)
 setAdminPinError(false)
 setShowAdminPinModal(true)
 }

 const performSave = async (adminPin: string) => {
 setSaving(true)
 setAdminPinError(false)
 setMessage(null)
 try {
 const { error } = await api.dashboard.settings.patch({
 query: { tenantId },
 body: {
 name: settings.name,
 ruc: settings.ruc,
 razonSocial: settings.razonSocial,
 nombreComercial: settings.nombreComercial,
 direccion: settings.direccion,
 ubigeo: settings.ubigeo,
 receiptFooter: settings.receiptFooter ?? '',
 ...(apisperuTokenInput.trim() ? { apisperuToken: apisperuTokenInput.trim() } : {}),
 apisperuUrl: settings.apisperuUrl,
 igvRate: Number(settings.igvRate),
 defaultIgvRegime: settings.defaultIgvRegime,
 pricesIncludeIgv: settings.pricesIncludeIgv,
 electronicInvoicingEnabled: settings.electronicInvoicingEnabled,
 serieBoleta: settings.serieBoleta,
 serieFactura: settings.serieFactura,
 serieNotaCredito: settings.serieNotaCredito,
 serieNotaDebito: settings.serieNotaDebito,
 adminPin,
 },
 })
 if (error) {
 const msg = (error.value as { message?: string } | null)?.message ?? 'Error al guardar la configuración.'
 setAdminPinError(true)
 setMessage({ type: 'error', text: msg })
 return
 }
 setShowAdminPinModal(false)
 setApisperuTokenInput('')
 if (apisperuTokenInput.trim()) {
 setSettings((prev) => ({ ...prev, hasApisperuToken: true }))
 }
 setMessage({ type: 'success', text: 'Configuración guardada correctamente.' })
 } catch (err) {
 console.error('Failed to save tenant settings:', err)
 setAdminPinError(true)
 setMessage({ type: 'error', text: 'Error al guardar la configuración.' })
 } finally {
 setSaving(false)
 }
 }

 const isConfigured =
 settings.electronicInvoicingEnabled && settings.ruc && settings.razonSocial && settings.hasApisperuToken

 return (
  <div>
 {/* Header */}
 <header className="mb-6 flex items-center justify-between">
 <div className="flex items-center gap-3">
 <p className="text-sm text-muted-foreground">Datos fiscales y APISPeru</p>
 </div>
 <Button onClick={handleSave} disabled={saving || loading || loadFailed}>
 <Save className="w-4 h-4 mr-2" />
 {saving ? 'Guardando...' : 'Guardar'}
 </Button>
 </header>

 {message && (
 <div
 className={cn(
 'mb-4 flex items-center gap-2 rounded-lg px-4 py-3 text-sm',
 message.type === 'success' ? 'bg-success-soft text-success' : 'bg-danger-soft text-destructive'
 )}
 >
 <AlertCircle className="w-4 h-4" />
 {message.text}
 </div>
 )}

 {!isConfigured && !loading && (
 <div className="mb-6 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
 La facturación electrónica está desactivada. Actívala e ingresa RUC, Razón Social y Token APISPeru para emitir comprobantes electrónicos.
 </div>
 )}

 {loading ? (
 <div className="space-y-4">
 <Skeleton className="h-12 rounded-xl bg-background" />
 <Skeleton className="h-12 rounded-xl bg-background" />
 <Skeleton className="h-12 rounded-xl bg-background" />
 </div>
 ) : (
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 {/* Company data */}
 <Card className="bg-background border-border rounded-xl">
 <CardHeader>
 <CardTitle className="flex items-center gap-2 text-base">
 <Building2 className="w-5 h-5 text-brand-500" />
 Datos de la empresa
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div className="space-y-1.5">
 <Label className="text-xs text-muted-foreground">RUC</Label>
 <Input
 value={settings.ruc ?? ''}
 onChange={(e) => handleChange('ruc', e.target.value)}
 placeholder="20123456789"
 className="bg-muted border-border"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs text-muted-foreground">Nombre comercial</Label>
 <Input
 value={settings.nombreComercial ?? ''}
 onChange={(e) => handleChange('nombreComercial', e.target.value)}
 placeholder="Mi Tienda"
 className="bg-muted border-border"
 />
 </div>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs text-muted-foreground">Razón social</Label>
 <Input
 value={settings.razonSocial ?? ''}
 onChange={(e) => handleChange('razonSocial', e.target.value)}
 placeholder="EMPRESA SAC"
 className="bg-muted border-border"
 />
 </div>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div className="space-y-1.5">
 <Label className="text-xs text-muted-foreground">Dirección fiscal</Label>
 <Input
 value={settings.direccion ?? ''}
 onChange={(e) => handleChange('direccion', e.target.value)}
 placeholder="Av. Principal 123"
 className="bg-muted border-border"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs text-muted-foreground">Ubigeo</Label>
 <Input
 value={settings.ubigeo ?? ''}
 onChange={(e) => handleChange('ubigeo', e.target.value)}
 placeholder="150101"
 className="bg-muted border-border"
 />
 </div>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs text-muted-foreground">Pie del recibo (vacío = texto por defecto)</Label>
 <Textarea
 value={settings.receiptFooter ?? ''}
 onChange={(e) => handleChange('receiptFooter', e.target.value)}
 maxLength={300}
 rows={2}
 className="bg-muted border-border"
 />
 </div>
 </CardContent>
 </Card>

 {/* APISPeru */}
 <Card className="bg-background border-border rounded-xl">
 <CardHeader>
 <CardTitle className="text-base">APISPeru</CardTitle>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="flex items-center justify-between rounded-lg border border-border bg-muted p-3">
 <div>
 <p className="text-sm font-medium text-foreground">Facturación electrónica</p>
 <p className="text-xs text-muted-foreground">
 {settings.electronicInvoicingEnabled
 ? 'Emisión a SUNAT habilitada'
 : 'Solo tickets internos; sin envío a SUNAT'}
 </p>
 </div>
 <button
 type="button"
 onClick={() => handleChange('electronicInvoicingEnabled', !settings.electronicInvoicingEnabled)}
 className={cn(
 'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
 settings.electronicInvoicingEnabled ? 'bg-primary' : 'bg-muted'
 )}
 aria-label="Activar facturación electrónica"
 >
 <span
 className={cn(
 'inline-block h-4 w-4 transform rounded-full bg-background transition-transform',
 settings.electronicInvoicingEnabled ? 'translate-x-6' : 'translate-x-1'
 )}
 />
 </button>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs text-muted-foreground">Token APISPeru</Label>
 <Input
 type="password"
 value={apisperuTokenInput}
 onChange={(e) => setApisperuTokenInput(e.target.value)}
 placeholder={settings.hasApisperuToken ? '•••••••• configurado' : 'No configurado'}
 className="bg-muted border-border"
 />
 <p className="text-xs text-muted-foreground">
 {settings.hasApisperuToken
 ? 'Token configurado. Déjalo en blanco para no cambiarlo.'
 : 'Sin token solo se podrán emitir tickets internos.'}
 </p>
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs text-muted-foreground">URL APISPeru</Label>
 <Input
 value={settings.apisperuUrl ?? ''}
 onChange={(e) => handleChange('apisperuUrl', e.target.value)}
 placeholder={DEFAULT_APISPERU_URL}
 className="bg-muted border-border"
 />
 </div>
 </CardContent>
 </Card>

 {/* Fiscal settings */}
 <Card className="bg-background border-border rounded-xl">
 <CardHeader>
 <CardTitle className="text-base">Configuración fiscal</CardTitle>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div className="space-y-1.5">
 <Label className="text-xs text-muted-foreground">Tasa IGV (%)</Label>
 <Input
 type="number"
 value={settings.igvRate}
 onChange={(e) => handleChange('igvRate', Number(e.target.value))}
 className="bg-muted border-border"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs text-muted-foreground">Régimen IGV default</Label>
 <select
 value={settings.defaultIgvRegime}
 onChange={(e) => handleChange('defaultIgvRegime', e.target.value)}
 className="w-full h-10 rounded-md border border-border bg-muted px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
 >
 <option value="GRAVADO">Gravado</option>
 <option value="GRAVADO_10_5">Gravado 10.5%</option>
 <option value="EXONERADO">Exonerado</option>
 <option value="INAFECTO">Inafecto</option>
 <option value="ICBPER">ICBPER</option>
 </select>
 </div>
 </div>
 <div className="flex items-center gap-3">
 <input
 type="checkbox"
 id="pricesIncludeIgv"
 checked={settings.pricesIncludeIgv}
 onChange={(e) => handleChange('pricesIncludeIgv', e.target.checked)}
 className="h-4 w-4 rounded border-border bg-muted text-brand-500 focus:ring-brand-500"
 />
 <label htmlFor="pricesIncludeIgv" className="text-sm text-muted-foreground">
 Los precios de productos incluyen IGV
 </label>
 </div>
 <Badge variant={settings.defaultIgvRegime === 'EXONERADO' ? 'success' : 'warning'}>
 Actual: {settings.defaultIgvRegime}
 </Badge>
 </CardContent>
 </Card>

 {/* Series */}
 <Card className="bg-background border-border rounded-xl">
 <CardHeader>
 <CardTitle className="text-base">Series de comprobantes</CardTitle>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="grid grid-cols-2 gap-4">
 <div className="space-y-1.5">
 <Label className="text-xs text-muted-foreground">Boleta</Label>
 <Input
 value={settings.serieBoleta}
 onChange={(e) => handleChange('serieBoleta', e.target.value)}
 className="bg-muted border-border"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs text-muted-foreground">Factura</Label>
 <Input
 value={settings.serieFactura}
 onChange={(e) => handleChange('serieFactura', e.target.value)}
 className="bg-muted border-border"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs text-muted-foreground">Nota de crédito</Label>
 <Input
 value={settings.serieNotaCredito}
 onChange={(e) => handleChange('serieNotaCredito', e.target.value)}
 className="bg-muted border-border"
 />
 </div>
 <div className="space-y-1.5">
 <Label className="text-xs text-muted-foreground">Nota de débito</Label>
 <Input
 value={settings.serieNotaDebito}
 onChange={(e) => handleChange('serieNotaDebito', e.target.value)}
 className="bg-muted border-border"
 />
 </div>
 </div>
 </CardContent>
 </Card>
 </div>
 )}

 {/* Admin PIN confirmation modal */}

<Dialog open={showAdminPinModal} onOpenChange={(o) => { if (!o && !saving) setShowAdminPinModal(false) }}>
 <DialogContent size="sm" className="gap-5">
 <DialogHeader><DialogTitle className="text-lg font-bold">PIN de Administrador</DialogTitle></DialogHeader>
 <p className="text-center text-sm text-muted-foreground">
 Ingresa el PIN de un administrador (5 dígitos) para guardar la configuración.
 </p>
 <PinPad onComplete={performSave} disabled={saving} hasError={adminPinError} />
 {adminPinError && message?.text && (
 <p className="text-center text-sm text-destructive">{message.text}</p>
 )}
 </DialogContent>
 </Dialog>
 </div>
 )
}

import { cn } from '@/lib/utils'
