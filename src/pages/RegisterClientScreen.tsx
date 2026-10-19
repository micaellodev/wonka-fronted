import { useState } from 'react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { TerminalShell } from '@/components/TerminalShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, UserPlus, Users, Phone, FileText, CheckCircle2, Loader2, Sparkles, AlertCircle } from 'lucide-react'
// Eden treaty no tipa estas rutas dinámicas; respuesta JSON laxa a propósito
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

interface Child {
  id: string
  fullName: string
  dni: string | null
  age: number | null
  gender: string | null
  guardianId: string
  tenantId: string
  createdAt: string
}

interface Guardian {
  id: string
  dni: string
  phone: string | null
  fullName: string
  tenantId: string
  createdAt: string
  children: Child[]
}

export function RegisterClientScreen() {
  const { tenantId } = useAuthStore()
  const [searchDni, setSearchDni] = useState('')
  const [lookingUp, setLookingUp] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lookupResult, setLookupResult] = useState<Guardian | null>(null)
  const [lookupState, setLookupState] = useState<'idle' | 'not-found' | 'found' | 'found-reniec'>('idle')
  const [lookupMessage, setLookupMessage] = useState<string | null>(null)

  // Guardian form state
  const [guardianDni, setGuardianDni] = useState('')
  const [guardianName, setGuardianName] = useState('')
  const [guardianPhone, setGuardianPhone] = useState('')
  const [guardianDniLoading, setGuardianDniLoading] = useState(false)
  const [guardianDniSource, setGuardianDniSource] = useState<'reniec' | null>(null)

  // Child form state
  const [childDni, setChildDni] = useState('')
  const [childName, setChildName] = useState('')
  const [childAge, setChildAge] = useState('')
  const [childGender, setChildGender] = useState<'M' | 'F' | ''>('')
  const [childDniLoading, setChildDniLoading] = useState(false)
  const [childDniSource, setChildDniSource] = useState<'reniec' | null>(null)

  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Consultar DNI en APISPeru (RENIEC)
  const consultarDniApiPeru = async (dni: string) => {
    if (!dni || dni.length !== 8) {
      throw new Error('El DNI debe tener 8 dígitos numéricos.')
    }
    const res = await (api.apisperu.dni as Loose)({ dni }).get({ query: { tenantId } })
    if (res.error) {
      const msg = res.error?.value?.message || res.error?.message || 'Error al consultar DNI en APISPeru'
      throw new Error(msg)
    }
    const d = res.data?.data
    if (!d) throw new Error('No se encontraron datos para este DNI.')
    return d as {
      numero: string
      nombre_completo: string
      nombres: string
      apellido_paterno: string
      apellido_materno: string
      nombre: string
    }
  }

  // Buscar DNI de apoderado directamente
  const handleConsultarDniGuardian = async (overrideDni?: string) => {
    const dni = (overrideDni ?? guardianDni).trim()
    if (!dni || dni.length !== 8) {
      setErrorMessage('Ingresa un DNI de 8 dígitos para consultar en RENIEC.')
      return
    }
    setGuardianDniLoading(true)
    setErrorMessage(null)
    try {
      const data = await consultarDniApiPeru(dni)
      const fullName = data.nombre_completo || data.nombre || `${data.nombres} ${data.apellido_paterno} ${data.apellido_materno}`.trim()
      setGuardianName(fullName)
      setGuardianDniSource('reniec')
    } catch (err: Loose) {
      setErrorMessage(err.message || 'No se pudo consultar el DNI del apoderado.')
    } finally {
      setGuardianDniLoading(false)
    }
  }

  // Buscar DNI de niño directamente
  const handleConsultarDniChild = async (overrideDni?: string) => {
    const dni = (overrideDni ?? childDni).trim()
    if (!dni || dni.length !== 8) {
      setErrorMessage('Ingresa un DNI de 8 dígitos para consultar en RENIEC.')
      return
    }
    setChildDniLoading(true)
    setErrorMessage(null)
    try {
      const data = await consultarDniApiPeru(dni)
      const fullName = data.nombre_completo || data.nombre || `${data.nombres} ${data.apellido_paterno} ${data.apellido_materno}`.trim()
      setChildName(fullName)
      setChildDniSource('reniec')
    } catch (err: Loose) {
      setErrorMessage(err.message || 'No se pudo consultar el DNI del menor.')
    } finally {
      setChildDniLoading(false)
    }
  }

  // Búsqueda general en el panel izquierdo (DB local + fallback automático a APISPeru)
  const handleLookup = async () => {
    const q = searchDni.trim()
    if (!q || !tenantId) return
    setLookingUp(true)
    setErrorMessage(null)
    setSuccessMessage(null)
    setLookupMessage(null)
    setGuardianDniSource(null)
    setChildDniSource(null)

    try {
      // 1. Buscar en BD local
      const res = await (api.playzone.guardians.lookup as Loose).get({ query: { tenantId, q } })
      if (res.error) {
        setLookupState('idle')
        setErrorMessage((res.error.value as Loose)?.message ?? 'No se pudo consultar el cliente en el servidor.')
        return
      }
      if (!res.error && (res.data as Loose).found) {
        const guardian = (res.data as Loose).data as Guardian
        setLookupResult(guardian)
        setLookupState('found')
        setGuardianDni(guardian.dni)
        setGuardianName(guardian.fullName)
        setGuardianPhone(guardian.phone ?? '')
        return
      }

      // 2. Si no está en BD local y tiene 8 dígitos, consultar APISPeru
      if (q.length === 8) {
        try {
          const apiData = await consultarDniApiPeru(q)
          const fullName = apiData.nombre_completo || apiData.nombre || `${apiData.nombres} ${apiData.apellido_paterno} ${apiData.apellido_materno}`.trim()
          setLookupResult(null)
          setLookupState('found-reniec')
          setLookupMessage(`DNI no registrado en Wonka. Se cargó el nombre desde RENIEC: "${fullName}".`)
          setGuardianDni(q)
          setGuardianName(fullName)
          setGuardianPhone('')
          setGuardianDniSource('reniec')
          return
        } catch {
          // Si no se encuentra en APISPeru, se procede con estado not-found normal
        }
      }

      setLookupResult(null)
      setLookupState('not-found')
      setGuardianDni(q)
      setGuardianName('')
      setGuardianPhone('')
    } catch {
      setLookupState('idle')
      setErrorMessage('Error de conexión al buscar el cliente.')
    } finally {
      setLookingUp(false)
    }
  }

  const handleSave = async () => {
    if (!tenantId || saving) return
    if (!guardianDni.trim() || !guardianName.trim() || !childName.trim()) {
      setErrorMessage('Por favor completa el DNI del apoderado, nombre del apoderado y nombre del niño.')
      return
    }
    setSaving(true)
    setErrorMessage(null)
    try {
      const body: Record<string, unknown> = {
        tenantId,
        dni: guardianDni.trim(),
        fullName: guardianName.trim(),
        childName: childName.trim(),
      }
      if (guardianPhone.trim()) body.phone = guardianPhone.trim()
      if (childDni.trim()) body.childDni = childDni.trim()
      if (childAge.trim()) body.childAge = Number(childAge)
      if (childGender) body.childGender = childGender

      const res = await (api.playzone.guardians as Loose).post(body)
      if (!res.error) {
        const guardian = (res.data as Loose).data as Guardian
        setLookupResult(guardian)
        setLookupState('found')
        setSearchDni(guardian.dni)
        setGuardianDni(guardian.dni)
        setGuardianName(guardian.fullName)
        setGuardianPhone(guardian.phone ?? '')
        setChildDni('')
        setChildName('')
        setChildAge('')
        setChildGender('')
        setGuardianDniSource(null)
        setChildDniSource(null)
        setSuccessMessage('Cliente y menor registrados exitosamente.')
      } else {
        setErrorMessage((res.error.value as Loose)?.message ?? 'No se pudo registrar el cliente.')
      }
    } catch {
      setErrorMessage('Error de conexión al guardar el cliente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <TerminalShell activeSection="register-client">
      <div className="space-y-4 max-w-6xl mx-auto">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-black tracking-tight text-foreground">Registrar cliente</h1>
          <p className="text-sm text-muted-foreground">
            Busca un apoderado registrado o crea uno nuevo con consulta automática a RENIEC / APISPeru.
          </p>
        </div>

        {errorMessage && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-danger-soft p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
            <p className="flex-1">{errorMessage}</p>
            <Button variant="ghost" size="sm" onClick={() => setErrorMessage(null)} className="text-xs h-7">
              Cerrar
            </Button>
          </div>
        )}

        {successMessage && (
          <div className="flex items-center gap-2 rounded-xl border border-secondary-200 bg-secondary-50 p-3 text-sm text-foreground">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-secondary-600" />
            <p className="flex-1 font-medium">{successMessage}</p>
            <Button variant="ghost" size="sm" onClick={() => setSuccessMessage(null)} className="text-xs h-7">
              Cerrar
            </Button>
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="border-border bg-background shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Search className="h-4 w-4 text-brand-500" />
                Buscar cliente
              </CardTitle>
              <CardDescription>Busca por DNI del apoderado en el sistema o en RENIEC.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={searchDni}
                  onChange={(e) => setSearchDni(e.target.value.replace(/\D/g, ''))}
                  placeholder="DNI apoderado (8 dígitos)"
                  inputMode="numeric"
                  maxLength={15}
                  onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                />
                <Button onClick={handleLookup} disabled={lookingUp || !searchDni} className="min-w-20">
                  {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
                </Button>
              </div>

              {lookupState === 'found' && lookupResult && (
                <div className="rounded-xl border border-secondary-200 bg-secondary-50 p-3 text-sm text-foreground space-y-1">
                  <div className="flex items-center gap-2 font-bold text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-secondary-600 shrink-0" />
                    Cliente registrado en Wonka
                  </div>
                  <p className="font-semibold">{lookupResult.fullName}</p>
                  <p className="text-xs text-muted-foreground">DNI: {lookupResult.dni} {lookupResult.phone ? `· Tel: ${lookupResult.phone}` : ''}</p>
                  <Badge variant="secondary" className="mt-1">
                    {lookupResult.children.length} {lookupResult.children.length === 1 ? 'niño asociado' : 'niños asociados'}
                  </Badge>
                </div>
              )}

              {lookupState === 'found-reniec' && (
                <div className="rounded-xl border border-info/30 bg-info-soft p-3 text-sm text-info space-y-1">
                  <div className="flex items-center gap-2 font-bold text-info">
                    <Sparkles className="h-4 w-4 text-info shrink-0" />
                    Autorellenado con RENIEC
                  </div>
                  <p className="text-xs">{lookupMessage}</p>
                </div>
              )}

              {lookupState === 'not-found' && (
                <div className="rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm text-warning">
                  No existe un cliente con ese DNI en el sistema. Puedes consultar RENIEC o completar el formulario manualmente.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border bg-background shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-lg">
                <span className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-brand-500" />
                  Nuevo cliente
                </span>
                <span className="text-xs font-normal text-muted-foreground flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5 text-secondary-500" /> Integración DNI ApiPeru
                </span>
              </CardTitle>
              <CardDescription>Datos del apoderado y del primer niño asociado.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {/* DNI Apoderado con botón de consulta */}
              <Field label="DNI apoderado" icon={<FileText className="h-4 w-4" />}>
                <div className="flex gap-2">
                  <Input
                    value={guardianDni}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '')
                      setGuardianDni(val)
                      if (val.length === 8 && !guardianName) {
                        handleConsultarDniGuardian(val)
                      }
                    }}
                    placeholder="8 dígitos"
                    inputMode="numeric"
                    maxLength={15}
                    onKeyDown={(e) => e.key === 'Enter' && handleConsultarDniGuardian()}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleConsultarDniGuardian()}
                    disabled={guardianDniLoading || guardianDni.length !== 8}
                    title="Consultar DNI en RENIEC / APISPeru"
                    className="shrink-0"
                  >
                    {guardianDniLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-secondary-600" />
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-semibold">
                        <Search className="h-3.5 w-3.5" /> RENIEC
                      </span>
                    )}
                  </Button>
                </div>
                {guardianDniSource === 'reniec' && (
                  <p className="text-[11px] text-secondary-600 font-medium flex items-center gap-1 mt-1">
                    <CheckCircle2 className="h-3 w-3" /> Nombre verificado por RENIEC / APISPeru
                  </p>
                )}
              </Field>

              {/* Nombre completo Apoderado */}
              <Field label="Nombre completo apoderado">
                <Input
                  value={guardianName}
                  onChange={(e) => setGuardianName(e.target.value)}
                  placeholder="Nombres y apellidos"
                />
              </Field>

              {/* Teléfono */}
              <Field label="Teléfono" icon={<Phone className="h-4 w-4" />}>
                <Input
                  value={guardianPhone}
                  onChange={(e) => setGuardianPhone(e.target.value)}
                  placeholder="Opcional (ej. 987654321)"
                  inputMode="tel"
                />
              </Field>

              {/* DNI Niño con botón de consulta */}
              <Field label="DNI niño" icon={<FileText className="h-4 w-4" />}>
                <div className="flex gap-2">
                  <Input
                    value={childDni}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '')
                      setChildDni(val)
                      if (val.length === 8 && !childName) {
                        handleConsultarDniChild(val)
                      }
                    }}
                    placeholder="8 dígitos (opcional)"
                    inputMode="numeric"
                    maxLength={15}
                    onKeyDown={(e) => e.key === 'Enter' && handleConsultarDniChild()}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleConsultarDniChild()}
                    disabled={childDniLoading || childDni.length !== 8}
                    title="Consultar DNI del menor en RENIEC / APISPeru"
                    className="shrink-0"
                  >
                    {childDniLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-secondary-600" />
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-semibold">
                        <Search className="h-3.5 w-3.5" /> RENIEC
                      </span>
                    )}
                  </Button>
                </div>
                {childDniSource === 'reniec' && (
                  <p className="text-[11px] text-secondary-600 font-medium flex items-center gap-1 mt-1">
                    <CheckCircle2 className="h-3 w-3" /> Nombre del niño verificado por RENIEC / APISPeru
                  </p>
                )}
              </Field>

              {/* Nombre del niño */}
              <Field label="Nombre del niño">
                <Input
                  value={childName}
                  onChange={(e) => setChildName(e.target.value)}
                  placeholder="Nombres y apellidos del niño"
                />
              </Field>

              {/* Edad */}
              <Field label="Edad">
                <Input
                  value={childAge}
                  onChange={(e) => setChildAge(e.target.value.replace(/\D/g, ''))}
                  placeholder="Ej. 5"
                  inputMode="numeric"
                  maxLength={2}
                />
              </Field>

              {/* Género */}
              <div className="md:col-span-2">
                <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Género</div>
                <div className="flex gap-2">
                  {(['M', 'F'] as const).map((value) => (
                    <Button
                      key={value}
                      type="button"
                      variant={childGender === value ? 'default' : 'outline'}
                      onClick={() => setChildGender(value)}
                    >
                      {value === 'M' ? 'Masculino' : 'Femenino'}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Barra de acción */}
              <div className="md:col-span-2 flex items-center justify-between rounded-xl border border-border bg-muted px-4 py-3 mt-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">Listo para registrar</p>
                  <p className="text-xs text-muted-foreground">Se guardará el apoderado y quedará asociado al menor.</p>
                </div>
                <Button onClick={handleSave} disabled={saving} className="font-bold">
                  {saving ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Guardando...
                    </span>
                  ) : (
                    'Registrar cliente'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {lookupResult && lookupResult.children.length > 0 && (
          <Card className="border-border bg-background shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-4 w-4 text-brand-500" />
                Hijos registrados de {lookupResult.fullName}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {lookupResult.children.map((child) => (
                <div key={child.id} className="rounded-xl border border-border bg-muted p-3">
                  <p className="font-semibold text-foreground">{child.fullName}</p>
                  <p className="text-xs text-muted-foreground">
                    {child.dni ? `DNI: ${child.dni}` : 'Sin DNI'} · {child.age !== null ? `${child.age} años` : 'Sin edad'} {child.gender ? `· ${child.gender === 'M' ? 'Niño' : 'Niña'}` : ''}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </TerminalShell>
  )
}

function Field({
  label,
  icon,
  children,
}: {
  label: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <label className="space-y-2 block">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {icon}
        {label}
      </div>
      {children}
    </label>
  )
}