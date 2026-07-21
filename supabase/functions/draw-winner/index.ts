import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char] ?? char));

async function sendWinnerEmail(winner: Record<string, string>): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM');
  if (!apiKey || !from) return false;

  const company = Deno.env.get('COMPANY_NAME') ?? 'ALTER EGO';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [winner.email],
      subject: `¡Felicidades! Ganaste el sorteo de ${company}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#16211b">
        <h1 style="color:#126b43">¡Tenemos un ganador!</h1>
        <p>Hola <strong>${escapeHtml(winner.first_name)}</strong>,</p>
        <p>Has sido seleccionado como ganador de nuestro sorteo por un cambio de look total.</p>
        <p>Tu número de participación es <strong>${escapeHtml(winner.participant_number)}</strong>.</p>
        <p>Nos comunicaremos contigo mediante los datos registrados para coordinar el premio.</p>
        <p>Equipo de ${escapeHtml(company)}</p>
      </div>`,
    }),
  });
  if (!response.ok) console.error('Resend:', response.status, await response.text());
  return response.ok;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'POST') return json({ ok: false, message: 'Método no permitido.' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ ok: false, message: 'Debes iniciar sesión.' }, 401);
    }

    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anonKey || !serviceRole) throw new Error('Faltan variables internas de Supabase.');

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ ok: false, message: 'Sesión inválida.' }, 401);

    const admin = createClient(url, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: adminRow, error: adminError } = await admin
      .from('admin_users')
      .select('user_id')
      .eq('user_id', userData.user.id)
      .maybeSingle();
    if (adminError) throw adminError;
    if (!adminRow) return json({ ok: false, message: 'No tienes permisos de administrador.' }, 403);

    const { data: participants, error: participantsError } = await admin
      .from('participants')
      .select('id, participant_number, first_name, last_name, phone, email, instagram')
      .eq('status', 'active');
    if (participantsError) throw participantsError;

    const { data: existingWinners, error: winnersError } = await admin
      .from('winners')
      .select('participant_id');
    if (winnersError) throw winnersError;

    const used = new Set((existingWinners ?? []).map((item) => item.participant_id));
    const eligible = (participants ?? []).filter((participant) => !used.has(participant.id));
    if (!eligible.length) {
      return json({ ok: false, message: 'No hay participantes disponibles para sortear.' });
    }

    const randomValues = new Uint32Array(1);
    crypto.getRandomValues(randomValues);
    const winner = eligible[randomValues[0] % eligible.length];

    const { data: winnerRow, error: insertError } = await admin
      .from('winners')
      .insert({ participant_id: winner.id, selected_by: userData.user.id })
      .select('id')
      .single();
    if (insertError) throw insertError;

    let emailSent = false;
    try {
      emailSent = await sendWinnerEmail(winner);
    } catch (error) {
      console.error('Winner email:', error);
    }
    if (emailSent) {
      const { error: emailUpdateError } = await admin
        .from('winners')
        .update({ email_sent: true })
        .eq('id', winnerRow.id);
      if (emailUpdateError) console.error('Update email_sent:', emailUpdateError);
    }

    return json({ ok: true, winner, email_sent: emailSent });
  } catch (error) {
    console.error('draw-winner:', error);
    return json({ ok: false, message: 'No se pudo realizar el sorteo.' }, 500);
  }
});
