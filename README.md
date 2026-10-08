# A fuego lento

Recetario personal en español, pensado para móvil. Cada receta tiene fotos, ingredientes, pasos, categoría, tiempo, raciones y notas. Incluye favoritas, búsqueda por nombre o ingredientes, copias de seguridad y una PWA con iconos para iPhone y Android.

## Estado actual

La app funciona sin configurar ningún servicio: crea un libro con una clave y guarda las recetas y fotos en IndexedDB, en este dispositivo. No hay recetas de ejemplo guardadas automáticamente.

La sincronización entre dispositivos funciona con **Neon o Supabase y el servidor en Vercel**. Sin esa configuración, la app indica que la sincronización está pendiente. Introducir la clave en un dispositivo nuevo recupera las recetas después de que el libro original se haya sincronizado.

## Ejecutar en el ordenador

Requisitos: Node.js 22 o posterior y pnpm 10.

```sh
pnpm install
pnpm dev
```

Abre la dirección que aparece en el terminal. Para comprobar la app:

```sh
pnpm test
pnpm build
```

## Subir a GitHub

Este proyecto ya tiene como remoto `https://github.com/mariecarmena-netizen/afuegolento.git`. Desde esta carpeta:

```sh
git add .
git commit -m "Crear A fuego lento"
git push -u origin main
```

`.env`, dependencias, compilaciones y archivos de Vercel se excluyen de Git. No subas conexiones de Neon, claves de Supabase ni copias de tus recetas al repositorio.

## Activar la sincronización con Neon

1. En tu proyecto de Vercel abre **Storage → Neon** y comprueba que la base de datos esté conectada al proyecto `afuegolento` en **Production**. La integración proporciona `DATABASE_URL`; la app también admite `POSTGRES_URL` y `POSTGRES_PRISMA_URL`. No pongas el prefijo `VITE_` a ninguna de ellas.
2. En **Query** de la integración de Vercel o en **SQL Editor** de Neon ejecuta [`neon/schema.sql`](neon/schema.sql). Crea las tablas y la función que controla las versiones. Puedes repetirlo sin borrar recetas.
3. Despliega la versión actual de la app. Si acabas de conectar Neon o cambiar variables de entorno, vuelve a desplegar para aplicarlas.
4. Abre la app en el dispositivo donde ya están tus recetas. En **Mi libro → Sincronizar ahora**, espera a ver **Libro sincronizado**. Se sube tu libro existente con su misma clave y sus fotos.
5. En el otro dispositivo abre **la misma dirección** de la app, elige **Abrir mi libro** e introduce esa clave. Se descargarán las recetas y fotos. Los cambios se sincronizan al guardar, al volver a la app y cada 15 segundos mientras está visible.

Para usar Neon localmente, crea `.env` a partir de `.env.example`, copia `DATABASE_URL` y ejecuta:

```sh
pnpm db:setup
pnpm dev
```

`pnpm db:setup` prepara el esquema en una transacción y conserva los datos existentes. El servidor local atiende las mismas rutas `/api` que Vercel. `/api/health` comprueba que la base de datos responde y que el esquema está preparado; los errores de sincronización aparecen en **Mi libro**.

La conexión con Neon se realiza solo en el servidor mediante el [controlador oficial](https://github.com/neondatabase/serverless), con consultas parametrizadas. La contraseña no se incluye en el JavaScript que recibe el navegador. Las fotos forman parte del contenido cifrado de cada receta; no hace falta un servicio de archivos aparte.

## Alternativa: sincronización con Supabase

Si usas Neon, puedes omitir esta sección. Si ya tenías un libro sincronizado en Supabase, mantén ese servicio hasta trasladar el libro con una copia de seguridad: cambiar de base de datos no copia automáticamente los datos remotos.

1. Crea una cuenta en [Supabase](https://supabase.com/) y un proyecto. Elige una región próxima a tus dispositivos y guarda la contraseña del proyecto.
2. Abre **SQL Editor**, crea una consulta y ejecuta todo el contenido de [`supabase/schema.sql`](supabase/schema.sql). Se crearán las tablas y la función para guardar recetas evitando sobrescrituras entre dispositivos.
3. En los ajustes del proyecto, copia la URL del proyecto y la clave **service_role** de las API keys. Esta clave solo se usa en el servidor; no uses la clave `anon` ni la publiques.
4. En [Vercel](https://vercel.com/new), importa el repositorio `afuegolento` de GitHub. Framework: **Vite**. Build command: **pnpm build**. Output directory: **dist**. Estas opciones también están en `vercel.json`.
5. Añade las variables de entorno `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en Vercel y despliega. Si las añades después, vuelve a desplegar para aplicarlas. No añadas el prefijo `VITE_`.
6. Abre la URL definitiva de Vercel en el móvil, crea el libro, guarda una receta y comprueba que indica **Libro sincronizado**. Copia la clave desde **Mi libro**.
7. En otro dispositivo abre esa misma URL, elige **Abrir mi libro** e introduce la clave. Se descargarán las recetas y fotos del libro. Los cambios se sincronizan al guardar, al volver a la app y cada 15 segundos mientras está visible.

Para probar Supabase localmente, crea un archivo `.env` tomando `.env.example` como referencia y reinicia `pnpm dev`. El servidor local ya atiende las mismas rutas `/api` que Vercel.

## Instalar en el móvil

- **iPhone**: abre la URL HTTPS definitiva en Safari, pulsa Compartir y **Añadir a pantalla de inicio**.
- **Android**: abre la URL en Chrome, abre el menú y elige **Instalar aplicación** o **Añadir a pantalla de inicio**.

Tras la primera carga, la versión desplegada guarda los archivos de la app para poder abrirse sin conexión. Las recetas se conservan en el dispositivo y los cambios pendientes se envían al recuperar la conexión. El servidor de desarrollo no instala el service worker.

## Datos y clave

La clave del libro es el acceso al libro: cualquiera que la tenga puede abrirlo. Tiene 120 bits aleatorios y no hay cuenta, correo ni recuperación de clave. Guárdala fuera del navegador. Las recetas y las fotos se cifran con AES-GCM antes de enviarse; las tablas guardan contenidos cifrados y el identificador del libro es un hash de la clave. El servidor recibe la clave por HTTPS para autorizar las peticiones, pero no la guarda en la base de datos ni la incluye en las URLs.

En Neon el servidor accede con el propietario de la base de datos y se revocan los permisos del rol público sobre las tablas y la función. En Supabase las tablas tienen RLS activado y el servidor accede con `service_role`. Las peticiones sin una clave válida se rechazan y todas las consultas de recetas se restringen al hash del libro autorizado.

Si dos dispositivos editan la misma receta, se conserva la versión remota y la versión local como otra receta con «(copia local)» en el título. Las eliminaciones se guardan como marcas para que otro dispositivo sin conexión no vuelva a añadir inadvertidamente recetas borradas.

Cada receta admite hasta cuatro fotos de 20 MB de origen; se reducen y comprimen antes de guardarse. Los formatos admitidos son JPG, PNG, WebP, AVIF y GIF (se guarda una imagen estática). Para HEIC, exporta primero a JPG.

**Mi libro → Descargar copia** genera un JSON con las recetas y fotos; no contiene la clave del libro. **Restaurar copia** añade las recetas como nuevas entradas sin sobrescribir las existentes. Descarga copias periódicas: borrar los datos del navegador también borra la copia local.

El almacenamiento está asociado a cada dominio. Si creas recetas en `localhost` o en una URL de preview de Vercel, no se trasladan automáticamente a otro dominio sin la sincronización configurada. Usa la copia de seguridad para trasladarlas o abre el libro con su clave después de sincronizarlo.

## Estructura

- `src/`: interfaz React, IndexedDB, tratamiento de fotos, cifrado y sincronización.
- `api/`: funciones de Vercel para el libro, las recetas y el estado de la conexión.
- `server/`: autorización y acceso a Neon o Supabase; estas claves nunca se incluyen en el cliente.
- `neon/schema.sql`: esquema para Neon y guardado con control de versiones.
- `scripts/setup-neon.mjs`: preparación del esquema de Neon desde `.env`.
- `supabase/schema.sql`: esquema y guardado con control de versiones.
- `public/icons/`: logo y tamaños de instalación; [prompt del logo](docs/LOGO.md).

No hace falta una API de inteligencia artificial para usar esta app.
