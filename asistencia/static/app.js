// WebAuthn helper functions for Wonka Asistencia

// Registering/viewing biometric enrollment options now requires an admin
// session (Authorization: Bearer <token>) — this is what previously let
// anyone enroll a credential for any employee_id with no proof of identity.
async function getRegistrationOptions(employeeId) {
    const token = localStorage.getItem('token');
    const resp = await fetch(`/api/admin/employees/${employeeId}/biometric-options`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    if (!resp.ok) throw new Error('Failed to get registration options');
    return await resp.json();
}

async function registerBiometric(employeeId, credential) {
    const token = localStorage.getItem('token');
    const resp = await fetch(`/api/admin/employees/${employeeId}/register-biometric`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ employee_id: employeeId, credential })
    });
    if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail || 'Registration failed');
    }
    return await resp.json();
}

async function getLoginOptions(employeeId) {
    const resp = await fetch(`/api/admin/employees/${employeeId}/login-options`);
    if (!resp.ok) throw new Error('Failed to get login options');
    return await resp.json();
}

async function checkin(employeeId, credential) {
    const resp = await fetch('/api/admin/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employeeId, credential })
    });
    if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail || 'Check-in failed');
    }
    return await resp.json();
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-PE');
}

function formatTime(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}
