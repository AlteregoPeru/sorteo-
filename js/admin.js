import { supabase } from './supabase-client.js';

const $ = (selector) => document.querySelector(selector);

let participants = [];
let winners = [];

const loginView = $('#loginView');
const appView = $('#appView');
const loginForm = $('#loginForm');
const loginButton = $('#loginBtn');
const loginMessage = $('#loginMessage');
const logoutButton = $('#logoutBtn');

function msg(element, text, type = 'error') {
    if (!element) {
        return;
    }

    element.textContent = text;
    element.className = text
        ? `form-message ${type}`
        : 'form-message';
}

function showLogin() {
    loginView?.classList.remove('hidden');
    appView?.classList.add('hidden');
}

function showApp() {
    loginView?.classList.add('hidden');
    appView?.classList.remove('hidden');
}

async function validateAdminSession() {
    const {
        data: { session },
        error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
        showLogin();
        return false;
    }

    const {
        data: isAdmin,
        error: adminError
    } = await supabase.rpc('is_admin');

    if (adminError || !isAdmin) {
        await supabase.auth.signOut();
        showLogin();
        return false;
    }

    showApp();
    await loadAll();
    return true;
}

async function initializeAdmin() {
    try {
        await validateAdminSession();
    } catch (error) {
        console.error('No se pudo restaurar la sesión:', error);
        showLogin();
    }
}

loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    loginButton.disabled = true;
    loginButton.innerHTML = '<span class="loader"></span> Ingresando…';
    msg(loginMessage, '');

    try {
        const { error: loginError } = await supabase.auth.signInWithPassword({
            email: $('#adminEmail').value.trim(),
            password: $('#adminPassword').value
        });

        if (loginError) {
            throw loginError;
        }

        const {
            data: isAdmin,
            error: adminError
        } = await supabase.rpc('is_admin');

        if (adminError || !isAdmin) {
            await supabase.auth.signOut();
            throw new Error('No autorizado');
        }

        showApp();
        await loadAll();
    } catch (error) {
        console.error(error);

        msg(
            loginMessage,
            'Credenciales incorrectas o usuario sin permisos de administrador.'
        );
    } finally {
        loginButton.disabled = false;
        loginButton.textContent = 'INICIAR SESIÓN';
    }
});

logoutButton?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    showLogin();
});

supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
        showLogin();
    }
});

document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => {
        document.querySelectorAll('[data-view]').forEach((item) => {
            item.classList.remove('active');
        });

        button.classList.add('active');

        ['dashboard', 'participants', 'draw'].forEach((view) => {
            $(`#${view}View`)?.classList.toggle(
                'hidden',
                view !== button.dataset.view
            );
        });
    });
});

async function loadAll() {
    const [participantsResult, winnersResult] = await Promise.all([
        supabase
            .from('participants')
            .select('*')
            .order('created_at', { ascending: false }),
        supabase
            .from('winners')
            .select('*, participants(*)')
            .order('created_at', { ascending: false })
    ]);

    if (participantsResult.error || winnersResult.error) {
        console.error(
            participantsResult.error || winnersResult.error
        );
        return;
    }

    participants = participantsResult.data || [];
    winners = winnersResult.data || [];

    renderStats();
    renderRecent();
    renderParticipants(participants);
    renderWinners();

    const availableParticipants = participants.filter((participant) => {
        const alreadyWon = winners.some((winner) => {
            return winner.participant_id === participant.id;
        });

        return participant.status === 'active' && !alreadyWon;
    });

    $('#eligibleText').textContent =
        `${availableParticipants.length} participantes disponibles para el sorteo.`;
}

const esc = (value) => {
    return String(value ?? '').replace(
        /[&<>'"]/g,
        (character) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        })[character]
    );
};

const formatDate = (value) => {
    return new Intl.DateTimeFormat('es-PE', {
        dateStyle: 'short',
        timeStyle: 'short'
    }).format(new Date(value));
};

function table(rows) {
    if (!rows.length) {
        return '<div class="empty">No hay registros para mostrar.</div>';
    }

    const body = rows.map((participant) => {
        return `
            <tr>
                <td>${esc(participant.participant_number)}</td>
                <td>
                    ${esc(participant.first_name)}
                    ${esc(participant.last_name)}
                </td>
                <td>
                    ${esc(participant.document_type)}
                    ${esc(participant.document_number)}
                </td>
                <td>${esc(participant.phone)}</td>
                <td>${esc(participant.email)}</td>
                <td>${formatDate(participant.created_at)}</td>
                <td>
                    <span class="badge badge-green">
                        ${esc(participant.status)}
                    </span>
                </td>
            </tr>
        `;
    }).join('');

    return `
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>N.º</th>
                        <th>Participante</th>
                        <th>Documento</th>
                        <th>Celular</th>
                        <th>Correo</th>
                        <th>Registro</th>
                        <th>Estado</th>
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        </div>
    `;
}

function renderStats() {
    const now = new Date();
    const today = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
    );
    const week = new Date(now);

    week.setDate(now.getDate() - 7);

    $('#statTotal').textContent = participants.length;
    $('#statToday').textContent = participants.filter((participant) => {
        return new Date(participant.created_at) >= today;
    }).length;
    $('#statWeek').textContent = participants.filter((participant) => {
        return new Date(participant.created_at) >= week;
    }).length;
    $('#statWinners').textContent = winners.length;
}

function renderRecent() {
    $('#recentTable').innerHTML = table(participants.slice(0, 8));
}

function renderParticipants(rows) {
    $('#participantsTable').innerHTML = table(rows);
}

function renderWinners() {
    if (!winners.length) {
        $('#winnersTable').innerHTML = `
            <div class="empty">
                Todavía no se ha realizado ningún sorteo.
            </div>
        `;
        return;
    }

    const body = winners.map((winner) => {
        return `
            <tr>
                <td>${formatDate(winner.created_at)}</td>
                <td>
                    <span class="badge badge-gold">
                        ${esc(winner.participants?.participant_number)}
                    </span>
                </td>
                <td>
                    ${esc(winner.participants?.first_name)}
                    ${esc(winner.participants?.last_name)}
                </td>
                <td>${esc(winner.participants?.email)}</td>
            </tr>
        `;
    }).join('');

    $('#winnersTable').innerHTML = `
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th>Número</th>
                        <th>Ganador</th>
                        <th>Correo</th>
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        </div>
    `;
}

$('#searchInput')?.addEventListener('input', (event) => {
    const query = event.target.value.toLowerCase().trim();

    if (!query) {
        renderParticipants(participants);
        return;
    }

    const filteredParticipants = participants.filter((participant) => {
        return [
            participant.first_name,
            participant.last_name,
            participant.document_number,
            participant.phone,
            participant.email,
            participant.participant_number
        ].some((value) => {
            return String(value).toLowerCase().includes(query);
        });
    });

    renderParticipants(filteredParticipants);
});

$('#refreshBtn')?.addEventListener('click', loadAll);

$('#exportBtn')?.addEventListener('click', () => {
    const headers = [
        'numero',
        'nombres',
        'apellidos',
        'tipo_documento',
        'documento',
        'celular',
        'correo',
        'fecha'
    ];

    const rows = participants.map((participant) => [
        participant.participant_number,
        participant.first_name,
        participant.last_name,
        participant.document_type,
        participant.document_number,
        participant.phone,
        participant.email,
        participant.created_at
    ]);

    const csv = [headers, ...rows]
        .map((row) => {
            return row
                .map((value) => {
                    const safeValue = String(value ?? '')
                        .replaceAll('"', '""');
                    return `"${safeValue}"`;
                })
                .join(',');
        })
        .join('\n');

    const blob = new Blob(['\ufeff' + csv], {
        type: 'text/csv;charset=utf-8'
    });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download =
        `participantes-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
});

$('#drawBtn')?.addEventListener('click', () => {
    $('#confirmModal')?.classList.remove('hidden');
});

$('#cancelDraw')?.addEventListener('click', () => {
    $('#confirmModal')?.classList.add('hidden');
});

$('#confirmDraw')?.addEventListener('click', async () => {
    $('#confirmModal')?.classList.add('hidden');

    const button = $('#drawBtn');
    const drawMessage = $('#drawMessage');

    button.disabled = true;
    msg(drawMessage, '');

    for (let number = 5; number >= 1; number--) {
        $('#countdown').textContent = number;
        $('#countdown').classList.remove('hidden');

        await new Promise((resolve) => {
            setTimeout(resolve, 700);
        });
    }

    $('#countdown').classList.add('hidden');

    const animation = setInterval(() => {
        const randomNumber = Math.floor(Math.random() * 99999) + 1;
        $('#drawNumber').textContent = String(randomNumber).padStart(5, '0');
    }, 70);

    try {
        const { data, error } = await supabase.functions.invoke(
            'draw-winner',
            {
                body: {}
            }
        );

        if (error) {
            throw error;
        }

        if (!data?.ok) {
            throw new Error(
                data?.message || 'No fue posible realizar el sorteo.'
            );
        }

        await new Promise((resolve) => {
            setTimeout(resolve, 1600);
        });

        clearInterval(animation);

        const winner = data.winner;

        $('#drawNumber').textContent = winner.participant_number;
        $('#winnerName').textContent =
            `${winner.first_name} ${winner.last_name}`;
        $('#winnerData').textContent =
            `${winner.document_type} ` +
            `•••${winner.document_number.slice(-4)} · ` +
            winner.email.replace(/(^.).*(@.*$)/, '$1••••$2');

        confetti();
        msg(drawMessage, 'Ganador seleccionado correctamente.', 'success');
        await loadAll();
    } catch (error) {
        clearInterval(animation);
        console.error(error);

        msg(
            drawMessage,
            error.message || 'Ocurrió un error al realizar el sorteo.'
        );
    } finally {
        button.disabled = false;
    }
});

function confetti() {
    const container = $('#confetti');

    container.innerHTML = '';

    for (let index = 0; index < 90; index++) {
        const piece = document.createElement('i');

        piece.style.left = `${Math.random() * 100}vw`;
        piece.style.animationDelay = `${Math.random() * 0.8}s`;
        piece.style.transform = `rotate(${Math.random() * 360}deg)`;

        container.appendChild(piece);
    }

    setTimeout(() => {
        container.innerHTML = '';
    }, 4000);
}

initializeAdmin();
