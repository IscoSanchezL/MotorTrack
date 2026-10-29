# Iskonex MotorTrack

Control de SOAT, impuestos, técnico-mecánica, seguro, aceite y mantenimientos de carros y motos,
con histórico, login con Google, aprobación del administrador y recordatorios gratis.

**Stack:** HTML/JS estático (Cloudflare Pages) · Firebase Auth + Firestore · GitHub Actions (recordatorios diarios) · Brevo (correo) · Telegram.
Nada de Supabase. SMS no tiene opción gratuita confiable: se usa correo + Telegram.

## Pasos, en este orden

### 1. GitHub
1. Crear el repositorio **Motortrack** (privado está bien).
2. Subir esta carpeta:
   ```bash
   git init && git add . && git commit -m "MotorTrack"
   git branch -M main
   git remote add origin https://github.com/<tu-usuario>/Motortrack.git
   git push -u origin main
   ```

### 2. Firebase: reutilizar el proyecto existente `labsnexo-ba465` (no gasta proyectos)
1. Entra a `labsnexo-ba465` en console.firebase.google.com. **Authentication** ya debería tener Google activo; si no, actívalo.
2. **Firestore > Reglas**: **no borres las que hay.** Copia en ellas, dentro de `match /databases/{database}/documents { ... }`,
   las funciones y los bloques `mt_*` de `firestore.rules` y publica. Las colecciones de MotorTrack empiezan con `mt_`, así que no chocan con LabsNexo.
3. **Configuración del proyecto > Tus apps > Agregar app Web (</>)**, nombre `MotorTrack`. Copia el `firebaseConfig` a `config.js`.
4. **Authentication > Configuración > Dominios autorizados**: agrega tu subdominio de Cloudflare.
5. Para los recordatorios: **Cuentas de servicio > Generar nueva clave privada** (JSON). No la subas al repo.
   Ojo: esa clave tiene acceso a todo el proyecto, por eso va solo como secreto de GitHub. El script solo toca colecciones `mt_*`.

### 3. Cloudflare Pages
Workers & Pages > tu proyecto actual (mismo subdominio) > conectar con el repo **Motortrack**, rama `main`.
Framework: *None*, comando de build: vacío, directorio de salida: `/`.
(Si no tienes proyecto previo: Crear > Pages > Conectar a Git.)

### 4. Primer ingreso
Entra a la web con `franksanlo@gmail.com`: queda **administrador y aprobado** automáticamente.
Los demás entran, ven "cuenta pendiente" y tú los apruebas en el botón **Usuarios**.

### 5. Recordatorios
1. **Brevo** (brevo.com, 300 correos/día gratis): verificar tu Gmail como remitente y crear una API key.
2. **Telegram** (opcional): @BotFather > `/newbot` > token. Cada usuario escribe a tu bot y pone su chat ID (lo da @userinfobot) en **🔔 Avisos**.
3. GitHub > repo > Settings > Secrets and variables > Actions > crear:
   `FIREBASE_SERVICE_ACCOUNT` (contenido completo del JSON), `BREVO_API_KEY`, `MAIL_FROM` (tu Gmail),
   `TELEGRAM_BOT_TOKEN` (opcional), `APP_URL` (URL de la web).
4. Actions > **Recordatorios** > *Run workflow* para probar. Después corre solo todos los días a las 8:00 a.m. Colombia.

Avisos: documentos a 30, 15, 7, 3 días, el día del vencimiento y cuando vencen; aceite cuando faltan los km configurados y
cuando se pasa. Cada aviso se envía una sola vez. También te avisa cuando alguien nuevo pide acceso.

> Si el repo es público, GitHub pausa los workflows programados tras 60 días sin actividad; en uno privado no pasa.
