import { supabase } from './supabase-client.js';
import { CONFIG } from './config.js';

const $ = (selector) => document.querySelector(selector);
const form = $('#registrationForm');
const button = $('#submitBtn');
const message = $('#formMessage');
const modalBackdrop = $('#modalBackdrop');
const modalClose = $('#modalClose');
let redirectTimer = null;

['#instagramLink', '#followInstagramLink', '#modalInstagram'].forEach((selector) => {
    const link = $(selector);
    if (link) link.href = CONFIG.INSTAGRAM_URL;
});
if ($('#year')) $('#year').textContent = new Date().getFullYear();

$('#documentType')?.addEventListener('change', (event) => {
    const input = $('#documentNumber');
    if (!input) return;
    const type = event.target.value;
    input.value = '';
    input.inputMode = type === 'DNI' ? 'numeric' : 'text';
    input.maxLength = type === 'DNI' ? 8 : 12;
    input.placeholder = type === 'DNI' ? '8 números' : type === 'CE' ? 'Número de CE' : 'Número de pasaporte';
});

const normalize = (value) => value.trim().replace(/\s+/g, ' ');
const cleanPhone = (value) => value.replace(/[^0-9+]/g, '');
const cleanDocument = (value) => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
const cleanInstagram = (value) => {
    const username = value.trim().replace(/^@+/, '').replace(/[^a-zA-Z0-9._]/g, '');
    return username ? `@${username}` : '';
};

const extractInstagramHandles = (value) => {
    const matches = value.match(/@[a-zA-Z0-9._]+/g) || [];
    return [...new Set(matches.map(cleanInstagram).filter(Boolean))];
};

function splitName(fullName) {
    const parts = normalize(fullName).split(' ');
    if (parts.length < 2) return { firstName: parts[0] || '', lastName: '' };
    return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) };
}

function showMessage(text, type = 'error') {
    if (!message) return;
    message.textContent = text;
    message.className = text ? `form-message ${type}` : 'form-message';
}

function showModal(title, text, success = true) {
    const modalTitle = $('#modalTitle');
    const modalText = $('#modalText');
    const modalIcon = $('#modalIcon');
    if (!modalBackdrop || !modalTitle || !modalText || !modalIcon) {
        showMessage(text, success ? 'success' : 'error');
        return;
    }
    modalTitle.textContent = title;
    modalText.textContent = text;
    modalIcon.textContent = success ? '✓' : '!';
    modalBackdrop.classList.remove('hidden');
}

function closeModal() { modalBackdrop?.classList.add('hidden'); }
modalClose?.addEventListener('click', closeModal);
modalBackdrop?.addEventListener('click', (event) => {
    if (event.target === modalBackdrop) closeModal();
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModal();
});

if (!form || !button) {
    console.error('No se encontró el formulario o el botón de envío.');
} else {
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        showMessage('');

        if (!form.checkValidity()) {
            showMessage('Completa todos los campos y confirma los requisitos para participar.');
            form.reportValidity();
            return;
        }

        const names = splitName($('#fullName').value);
        if (!names.firstName || !names.lastName) {
            showMessage('Escribe tu nombre y apellido completos.');
            $('#fullName').focus();
            return;
        }

        const payload = {
            first_name: names.firstName,
            last_name: names.lastName,
            document_type: $('#documentType').value,
            document_number: cleanDocument($('#documentNumber').value),
            phone: cleanPhone($('#phone').value),
            email: $('#email').value.trim().toLowerCase(),
            instagram: cleanInstagram($('#instagram').value),
            instagram_username: cleanInstagram($('#instagram').value),
            follows_instagram: $('#followsInstagram').checked,
            shared_with: extractInstagramHandles($('#sharedWith').value).join(' '),
            consent: $('#consent').checked
        };

        const documentRules = {
            DNI: { pattern: /^\d{8}$/, message: 'El DNI debe tener exactamente 8 números.' },
            CE: { pattern: /^[A-Z0-9]{9,12}$/, message: 'El carné de extranjería debe tener entre 9 y 12 caracteres.' },
            PASAPORTE: { pattern: /^[A-Z0-9]{6,12}$/, message: 'El pasaporte debe tener entre 6 y 12 letras o números.' }
        };
        const documentRule = documentRules[payload.document_type];
        if (!documentRule || !documentRule.pattern.test(payload.document_number)) {
            showMessage(documentRule?.message || 'Selecciona un tipo de documento válido.');
            $('#documentNumber').focus();
            return;
        }
        if (payload.phone.replace(/\D/g, '').length < 8) {
            showMessage('Ingresa un número de celular válido.');
            return;
        }
        if (payload.instagram.length < 3) {
            showMessage('Ingresa un usuario de Instagram válido.');
            return;
        }
        const sharedHandles = extractInstagramHandles($('#sharedWith').value);
        if (sharedHandles.length !== 3) {
            showMessage('Escribe exactamente 3 cuentas de Instagram: @ejemplo1 @ejemplo2 @ejemplo3.');
            $('#sharedWith').focus();
            return;
        }

        button.disabled = true;
        button.innerHTML = '<span class="loader"></span> ENVIANDO…';

        try {
            const { data, error } = await supabase.functions.invoke('register-participant', { body: payload });
            if (error) throw error;
            if (data?.status === 'duplicate') {
                showModal('Ya estás participando', 'Encontramos una participación con tu documento, celular, correo o Instagram. Cada persona puede participar una sola vez.', false);
                return;
            }
            if (!data?.ok) {
                showMessage(data?.message || 'No se pudo completar tu participación.');
                return;
            }

            if (!data.instagram_saved) {
                console.error('Supabase no confirmó el guardado del Instagram:', data);
                showMessage('El registro se creó, pero Instagram no quedó guardado. Vuelve a desplegar la función register-participant.', 'error');
                return;
            }

            form.reset();
            showModal('¡Ya estás participando!', `Tu número es ${data.participant_number}. Serás redirigido a Instagram en ${CONFIG.REDIRECT_SECONDS} segundos.`);
            clearTimeout(redirectTimer);
            redirectTimer = setTimeout(() => window.location.assign(CONFIG.INSTAGRAM_URL), CONFIG.REDIRECT_SECONDS * 1000);
        } catch (error) {
            console.error('register-participant:', error);
            showMessage('No pudimos conectar con Supabase. Inténtalo nuevamente.');
        } finally {
            button.disabled = false;
            button.innerHTML = '<span>ENVIAR Y PARTICIPAR</span>';
        }
    });
}
