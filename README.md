# Cashless Colombia · RRHH (control de personal)

App web progresiva (PWA) conectada a Supabase. Tres interfaces sobre la misma base de datos:

| Archivo | Para quién | Qué hace |
|---|---|---|
| `index.html` | Checador / kiosco | Reloj, lector NFC, salida con cédula, voz "registro confirmado", foto del colaborador |
| `admin.html` | Administrador | Resumen, colaboradores, asistencia, turnos, reportes PDF/Excel, nómina, módulos opcionales, configuración |
| `colaborador.html` | Colaborador | Registros y horas legales, permisos/incapacidades, desprendibles, perfil, chat, etc. |

## Estructura de archivos
Todos los archivos van **juntos en la raíz del repositorio, sin carpetas** (así basta con arrastrarlos todos a GitHub de una vez): los `.html`, los `.js`, `app.css`, `sw.js`, `manifest.json`, las imágenes `logo.png` e `icon-*.png`, y los `.sql` (estos últimos no hacen falta en GitHub; se ejecutan en Supabase).

## Puesta en marcha
1. **Base de datos:** Supabase → SQL Editor → pegue y ejecute `schema.sql` (una sola vez; se puede repetir sin perder datos). Crea tablas, políticas, el bucket de Storage `documentos`, el admin inicial y datos base.
2. **Administrador inicial:** usuario `admin`, contraseña `1234` (cámbiela en el menú de usuario o en Configuración).
3. **Colaboradores:** su contraseña inicial en el portal es su número de cédula.
4. **GitHub Pages:** suba todo el contenido de esta carpeta a un repositorio → Settings → Pages → rama `main`, carpeta `/root`. Abra la URL en el celular y use *Instalar aplicación*.
   El NFC (Web NFC) requiere **Chrome en Android con HTTPS** (GitHub Pages lo cumple).

## Archivos SQL (ejecutar en este orden, ambos son repetibles)
1. `schema.sql` — base de la app (incluye la actualización v2: género, ausencia temporal y copia del turno en cada marcación).
2. `schema_seleccion.sql` — solo tablas nuevas del módulo **Procesos de selección** (vacantes, candidatos, candidato_eventos). No modifica nada existente.

3. `schema_facial.sql` — tabla `rostros` (plantillas faciales), origen `facial` en marcaciones y columna `similitud`.

## Reconocimiento facial
- **Librería:** [@vladmandic/human](https://github.com/vladmandic/human) 3.3.6 (TensorFlow.js, corre en el navegador; no se envían imágenes a ningún servidor). Detección + malla facial + embedding + **antispoof** + **liveness**.
- **Registro:** Administración → Colaboradores → Editar → “Registrar rostro” (5 muestras guiadas, requiere marcar la autorización de datos biométricos, Ley 1581/2012). Solo se guarda el vector, no la foto. Rechaza rostros ya registrados a otra persona.
- **Marcación:** botón “Reconocimiento facial” en el checador. Exige un solo rostro, tamaño/centrado/nitidez mínimos, similitud ≥ 0.65 con margen sobre el segundo candidato, 3 fotogramas consecutivos con la misma persona, puntaje antispoof/liveness ≥ 0.5 y un desafío de giro de cabeza. Decide ingreso/salida con la misma lógica del NFC y guarda la similitud en la marcación.
- **Ajuste:** clave `facial` en `config.params` (`umbral`, `margen`, `real`, `live`, `frames`, `desafio`, `giro`, `timeout`). Requiere HTTPS y cámara.

## Novedades
- **Resumen → Analítica de personal:** gráficos de puntualidad, quién demora más, quién demora más de lo habitual (últimos 7 días vs. historial), llegadas tarde por día, horas por área, extras, y perfil del equipo (género, edad, generaciones, antigüedad, salarios, por área/cargo/contrato/turno).
- **Parámetros legales → Organigrama:** por jerarquía (cargo + campo Supervisor) o por áreas.
- **Cumpleaños:** tarjetas por mes y fecha (usa la fecha de nacimiento de la ficha del colaborador).
- **Ausencia temporal:** el colaborador la solicita en su portal (fecha, hora, cuánto tiempo, si regresa el mismo día). En el checador, su salida y su regreso quedan enlazados a la solicitud y el regreso se compara con el tiempo indicado.
- **Procesos de selección:** vacantes, portal público `postulacion.html` (el aspirante pega el enlace de Drive de su hoja de vida, no sube archivos), tablero por etapas (arrastrar y soltar), entrevistas/pruebas, checklist de contratación, indicadores y botón “Contratar” que crea al colaborador.

## Módulos opcionales
En **Configuración** el administrador activa o desactiva: asistencia, nómina, certificados, documentos y firma, activos, adelantos, objetivos, reconocimientos, encuestas, beneficios, canal de denuncias y comunicación, parámetros legales. Un módulo desactivado desaparece del panel, del portal y del checador (los datos se conservan).

## Reglas laborales aplicadas (editable en *Parámetros legales*)
- Jornada máxima: 42 h/semana desde 15-jul-2026 (Ley 2101/2021; 44 h desde jul-2025).
- Jornada nocturna: 7:00 p.m. a 6:00 a.m. · recargo nocturno 35% · extra diurna 25% · extra nocturna 75%.
- Recargo dominical/festivo: 90% desde 1-jul-2026 (80% desde jul-2025; 100% desde jul-2027) — Ley 2466/2025. Los recargos se suman.
- SMMLV 2026 $1.750.905 · auxilio de transporte $249.095 (Decretos 1469 y 1470 de 2025).
- Festivos calculados con la Ley Emiliani. Valor hora = salario ÷ ((jornada semanal ÷ 6) × 30).
- Nómina: salud 4%, pensión 4%, FSP, incapacidad al 66,67%, aportes del empleador, parafiscales (exoneración art. 114-1 configurable) y provisiones.

## Lógica del checador
- Tolerancia por turno (5 min por defecto): temprano / a tiempo / tarde.
- Jornada partida: si no marca la salida al almuerzo, el sistema la asume y la siguiente lectura es el regreso. En jornada continua no aplica almuerzo.
- Turnos: se crean en la pestaña **Crear turno** y alimentan el desplegable del formulario de colaborador. Cada marcación guarda una copia del turno vigente, así que cambiar o editar un turno nunca altera los registros anteriores.
- Anti doble lectura: 8 s en el lector y 60 s contra la base de datos.
- La llegada anticipada (antes del inicio del turno) no se cuenta como tiempo laborado; el tiempo después de la hora de salida se cuenta como extra (el admin puede corregir marcaciones).

## Seguridad — léalo
La app usa la clave `anon` de Supabase sin Supabase Auth, así que las políticas RLS del `schema.sql` permiten a `anon` leer y escribir. Las contraseñas se guardan como hash SHA-256 con sal, pero **cualquiera que obtenga la clave anon puede consultar la base**. Para producción con datos reales de nómina se recomienda migrar el login a Supabase Auth y restringir las políticas RLS por usuario.
