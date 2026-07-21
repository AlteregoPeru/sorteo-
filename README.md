# Sorteo ALTER EGO

Proyecto frontend para GitHub Pages conectado a Supabase.

## Qué usa

- GitHub Pages: `index.html`, `paginas/paginas/admin.html`, CSS y JavaScript.
- Supabase Database: participantes, administradores y ganadores.
- Supabase Auth: acceso del administrador con correo y contraseña.
- Supabase Edge Functions: participación pública y selección segura del ganador.
- No utiliza `alert()` ni `localStorage`.

## 1. Base de datos

Ejecuta una vez `supabase/schema.sql` en **Supabase > SQL Editor**.

## 2. Configuración pública

Revisa `js/config.js`. Solo debe contener la URL del proyecto y la clave `sb_publishable_...`.
Nunca coloques una clave `sb_secret_...` en GitHub ni en JavaScript.

## 3. Desplegar funciones

Desde la carpeta raíz del proyecto:

```bash
npx supabase login
npx supabase link --project-ref zlfmyecnetadjugfsyrq
npx supabase functions deploy register-participant
npx supabase functions deploy draw-winner
```

El archivo `supabase/config.toml` ya establece `verify_jwt = false` en ambas funciones. `draw-winner` sigue protegida porque valida internamente la sesión de Supabase Auth y comprueba `admin_users`.

## 4. Probar en el ordenador

No abras los HTML con doble clic. Usa Live Server de VS Code o ejecuta:

```bash
python -m http.server 5500
```

Luego abre:

- Formulario: `http://localhost:5500/index.html`
- Panel: `http://localhost:5500/paginas/paginas/admin.html`

## 5. Correos opcionales

Sin Resend, la participación y el sorteo funcionan, pero no se envían emails. Para activarlos:

```bash
npx supabase secrets set RESEND_API_KEY="TU_CLAVE"
npx supabase secrets set EMAIL_FROM="ALTER EGO <sorteos@tu-dominio.com>"
npx supabase secrets set COMPANY_NAME="ALTER EGO"
npx supabase secrets set DRAW_DATE_TEXT="Fecha y hora del sorteo"
```

Después vuelve a desplegar las dos funciones.
