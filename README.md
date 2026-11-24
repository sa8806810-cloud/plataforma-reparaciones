# Servicios y Reparaciones

Aplicación React + Vite para solicitar servicios de reparación. Supabase se usa
para autenticación y almacenamiento de solicitudes.

## Desarrollo local

1. Instala Node.js 20 o superior.
2. Copia `.env.example` a `.env` y completa la URL y la clave pública de Supabase.
3. Ejecuta:

   ```sh
   npm install
   npm run dev
   ```

Para validar la aplicación antes de publicar:

```sh
npm run lint
npm run build
```

## Publicar en Netlify

Conecta el repositorio Git a Netlify. El archivo `netlify.toml` define:

- Comando de compilación: `npm run build`
- Directorio publicado: `dist`
- Node.js: versión 20
- Reescritura de rutas de la SPA a `index.html`

En **Site configuration → Environment variables**, configura:

- `VITE_SUPABASE_URL`: URL del proyecto Supabase.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: clave publishable del proyecto. También se
  admite `VITE_SUPABASE_ANON_KEY` para instalaciones existentes.

Después de agregar o cambiar variables, inicia un nuevo deploy para que Vite las
incluya en la compilación. Estas variables `VITE_` se envían al navegador:
usa únicamente la clave publishable/anon, nunca la `service_role` ni una clave
secreta.

En Supabase, agrega el dominio de Netlify a las URL permitidas de Auth
(Site URL y Redirect URLs) para que los flujos de autenticación funcionen en
producción.

## Base de datos

Antes de desplegar el nuevo flujo, pega y ejecuta completo en Supabase SQL
Editor el archivo
`supabase/migrations/20261123180000_guest_technician_workflow.sql`. Agrega los
campos de contacto/asignación, elimina la lectura pública y configura políticas
RLS. No es necesario instalar Supabase CLI.

Las cuentas nuevas que eligen registrarse como técnico quedan pendientes. Para
aprobar una, copia su UUID desde **Authentication → Users** y ejecútalo en SQL
Editor:

```sql
INSERT INTO public.tecnicos_aprobados (usuario_id)
VALUES ('UUID-DEL-USUARIO')
ON CONFLICT (usuario_id) DO NOTHING;
```

Para revocar la aprobación:

```sql
DELETE FROM public.tecnicos_aprobados
WHERE usuario_id = 'UUID-DEL-USUARIO';
```

La tabla de aprobaciones no es accesible desde el cliente. La base comprueba la
aprobación en cada operación y no confía en el `user_metadata` editable por el
usuario. La lista de trabajos disponibles no devuelve dirección, referencias,
teléfono ni coordenadas GPS; esos datos solo se consultan después de aceptar un
trabajo. Actualiza la página del sitio después de aprobar o revocar una cuenta
para refrescar el indicador de estado del panel.
