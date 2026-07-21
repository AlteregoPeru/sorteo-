import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' } });
}
const normalizeText = (value: unknown, max = 160) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const normalizePhone = (value: unknown) => String(value ?? '').replace(/[^0-9+]/g, '').slice(0, 20);
const normalizeDocument = (value: unknown) => String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
const normalizeEmail = (value: unknown) => String(value ?? '').trim().toLowerCase().slice(0, 160);
const normalizeInstagram = (value: unknown) => {
  const clean = String(value ?? '').trim().replace(/^@+/, '').replace(/[^a-zA-Z0-9._]/g, '').slice(0, 79);
  return clean ? `@${clean}`.toLowerCase() : '';
};
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char] ?? char));

async function sendConfirmationEmail(participant: Record<string, string>): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM');
  if (!apiKey || !from) return false;
  const company = Deno.env.get('COMPANY_NAME') ?? 'ALTER EGO';
  const drawDate = Deno.env.get('DRAW_DATE_TEXT') ?? 'Próximamente';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [participant.email],
      subject: `¡Ya estás participando en la campaña de ${company}!`,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#16211b"><h1 style="color:#126b43">¡Participación confirmada!</h1><p>Hola <strong>${escapeHtml(participant.first_name)}</strong>,</p><p>Completaste tu registro en la campaña promocional de ALTER EGO.</p><p style="font-size:18px">Tu número de participación es <strong>${escapeHtml(participant.participant_number)}</strong>.</p><p><strong>Fecha del sorteo:</strong> ${escapeHtml(drawDate)}</p><p>Conserva este correo como confirmación.</p><p>Equipo de ${escapeHtml(company)}</p></div>`,
    }),
  });
  if (!response.ok) console.error('Resend:', response.status, await response.text());
  return response.ok;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, message: 'Método no permitido.' }, 405);

  try {
    const body = await req.json();
    const payload = {
      first_name: normalizeText(body.first_name, 80),
      last_name: normalizeText(body.last_name, 80),
      document_type: normalizeText(body.document_type, 12).toUpperCase(),
      document_number: normalizeDocument(body.document_number),
      phone: normalizePhone(body.phone),
      email: normalizeEmail(body.email),
      // Acepta el nombre actual y alias antiguos para evitar registros vacíos por caché.
      instagram: normalizeInstagram(body.instagram ?? body.instagram_username ?? body.instagram_user),
      follows_instagram: body.follows_instagram === true,
      shared_with: normalizeText(body.shared_with, 300),
      consent: body.consent === true,
    };

    if (payload.first_name.length < 2 || payload.last_name.length < 2) return json({ ok:false,status:'invalid',message:'Ingresa tu nombre completo.' });
    const documentPatterns: Record<string, RegExp> = {
      DNI: /^\d{8}$/,
      CE: /^[A-Z0-9]{9,12}$/,
      PASAPORTE: /^[A-Z0-9]{6,12}$/,
    };
    if (!documentPatterns[payload.document_type]) return json({ ok:false,status:'invalid',message:'Selecciona DNI, CE o PASAPORTE.' });
    if (!documentPatterns[payload.document_type].test(payload.document_number)) {
      const detail = payload.document_type === 'DNI' ? 'El DNI debe tener 8 números.' : payload.document_type === 'CE' ? 'El CE debe tener entre 9 y 12 caracteres.' : 'El pasaporte debe tener entre 6 y 12 letras o números.';
      return json({ ok:false,status:'invalid',message:detail });
    }
    if (payload.phone.replace(/\D/g, '').length < 8) return json({ ok:false,status:'invalid',message:'Ingresa un celular válido.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) return json({ ok:false,status:'invalid',message:'Correo electrónico inválido.' });
    if (payload.instagram.length < 3) return json({ ok:false,status:'invalid',message:'Usuario de Instagram inválido.' });
    if (!payload.follows_instagram) return json({ ok:false,status:'invalid',message:'Debes confirmar que sigues a @alteregoperu.' });
    if (payload.shared_with.length < 3) return json({ ok:false,status:'invalid',message:'Confirma que compartiste la campaña con 3 amigos.' });
    if (!payload.consent) return json({ ok:false,status:'invalid',message:'Debes aceptar los términos y condiciones.' });

    const url = Deno.env.get('SUPABASE_URL');
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceRole) throw new Error('Faltan variables internas de Supabase.');
    const admin = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin
      .from('participants')
      .insert(payload)
      .select('id, participant_number, first_name, email, instagram')
      .single();
    if (error) {
      if (error.code === '23505') return json({ ok:false,status:'duplicate',message:'Ya existe una participación con el documento, celular, correo o Instagram indicado.' });
      console.error('Insert participant:', error);
      return json({ ok:false,status:'error',message:'No se pudo guardar la participación.' }, 500);
    }
    // Verificación defensiva: nunca confirmar una participación si Instagram quedó vacío.
    let savedInstagram = normalizeInstagram(data.instagram);
    if (!savedInstagram && payload.instagram) {
      const { data: repaired, error: repairError } = await admin
        .from('participants')
        .update({ instagram: payload.instagram })
        .eq('id', data.id)
        .select('instagram')
        .single();
      if (repairError) {
        console.error('Repair Instagram:', repairError);
        return json({ ok:false,status:'error',message:'El registro fue creado, pero no se pudo guardar Instagram. Actualiza y despliega la función register-participant.' }, 500);
      }
      savedInstagram = normalizeInstagram(repaired?.instagram);
    }

    if (!savedInstagram) {
      return json({ ok:false,status:'error',message:'Instagram no se guardó correctamente.' }, 500);
    }

    let emailSent = false;
    try { emailSent = await sendConfirmationEmail(data); } catch (error) { console.error('Confirmation email:', error); }
    return json({ ok:true, participant_number:data.participant_number, instagram:savedInstagram, instagram_saved:true, email_sent:emailSent });
  } catch (error) {
    console.error('register-participant:', error);
    return json({ ok:false,status:'error',message:'No se pudo procesar la solicitud.' }, 500);
  }
});
