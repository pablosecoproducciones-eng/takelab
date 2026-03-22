// ─────────────────────────────────────────────────────────
// Netlify Function: send-reminders
// Ubicación: netlify/functions/send-reminders.js
//
// Cómo activar: configurar un Cron Job en netlify.toml
// (ver abajo) que llame esta función cada 30 minutos.
//
// NO modifica nada de send-whatsapp ni del sistema existente.
// Solo lee leads desde Supabase, compara tiempos y envía WA.
// ─────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY; // anon key
const SITE_URL     = process.env.URL;           // Netlify lo inyecta automáticamente

// ── Helpers ───────────────────────────────────────────────

async function sbGet(table, query) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?${query}`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  if (!res.ok) throw new Error(`sbGet ${table}: ${res.status}`);
  return res.json();
}

async function sbPatch(table, id, data) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(data),
    }
  );
  if (!res.ok) throw new Error(`sbPatch ${table} id=${id}: ${res.status}`);
}

async function sendWhatsApp(telefono, mensaje) {
  // Reutiliza la función existente send-whatsapp sin modificarla
  const res = await fetch(`${SITE_URL}/.netlify/functions/send-whatsapp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telefono, mensaje }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`send-whatsapp error ${res.status}: ${err}`);
  }
  return res.json();
}

// ── Lógica principal ──────────────────────────────────────

exports.handler = async function () {
  try {
    const now = new Date();

    // Leer leads con cita agendada que no tengan ambos recordatorios enviados
    // Solo leads con fecha_reunion dentro de las próximas 25 horas (margen amplio)
    const cutoff = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString();
    const desde  = new Date(now.getTime() - 30 * 60 * 1000).toISOString(); // no mirar citas ya pasadas

    const leads = await sbGet(
      'takelab_leads',
      `fecha_reunion=not.is.null` +
      `&fecha_reunion=gte.${desde.slice(0,10)}` +
      `&select=id,nombre,telefono,fecha_reunion,hora_reunion,reminder_24h_sent,reminder_2h_sent` +
      `&order=fecha_reunion.asc`
    );

    const resultados = [];

    for (const lead of leads) {
      const { id, nombre, telefono, fecha_reunion, hora_reunion, reminder_24h_sent, reminder_2h_sent } = lead;

      // Necesitamos teléfono para enviar WA
      if (!telefono || !fecha_reunion || !hora_reunion) continue;

      // Construir datetime de la cita
      // fecha_reunion: "2025-05-10", hora_reunion: "14:30"
      const [hh, mm] = (hora_reunion || '00:00').split(':');
      const citaDate = new Date(`${fecha_reunion}T${hh.padStart(2,'0')}:${mm.padStart(2,'0')}:00`);

      const diffMs     = citaDate.getTime() - now.getTime();
      const diffHours  = diffMs / (1000 * 60 * 60);

      const horaLabel  = hora_reunion; // ej "14:30"

      // ── Recordatorio 24h ─────────────────────────────
      // Ventana: entre 23h y 25h antes de la cita
      if (!reminder_24h_sent && diffHours >= 23 && diffHours <= 25) {
        const mensaje = `Hola ${nombre} 👋 Te recordamos tu sesión mañana a las ${horaLabel}. ¡Te esperamos!`;
        try {
          await sendWhatsApp(telefono, mensaje);
          await sbPatch('takelab_leads', id, { reminder_24h_sent: true });
          resultados.push({ id, tipo: '24h', ok: true });
          console.log(`[reminders] 24h enviado → lead ${id} (${nombre})`);
        } catch (e) {
          resultados.push({ id, tipo: '24h', ok: false, error: e.message });
          console.error(`[reminders] 24h ERROR lead ${id}:`, e.message);
        }
      }

      // ── Recordatorio 2h ──────────────────────────────
      // Ventana: entre 1.5h y 2.5h antes de la cita
      if (!reminder_2h_sent && diffHours >= 1.5 && diffHours <= 2.5) {
        const mensaje = `Hola ${nombre} 👋 Tu sesión es en 2 horas (${horaLabel}). Estamos listos para vos 🚀`;
        try {
          await sendWhatsApp(telefono, mensaje);
          await sbPatch('takelab_leads', id, { reminder_2h_sent: true });
          resultados.push({ id, tipo: '2h', ok: true });
          console.log(`[reminders] 2h enviado → lead ${id} (${nombre})`);
        } catch (e) {
          resultados.push({ id, tipo: '2h', ok: false, error: e.message });
          console.error(`[reminders] 2h ERROR lead ${id}:`, e.message);
        }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        procesados: leads.length,
        enviados: resultados.filter(r => r.ok).length,
        errores: resultados.filter(r => !r.ok).length,
        detalle: resultados,
      }),
    };

  } catch (err) {
    console.error('[reminders] Error general:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
