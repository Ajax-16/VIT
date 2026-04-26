# VIT — Version It!

Herramienta de CLI interactiva para gestionar versiones, changelogs y commits en proyectos mono o multi-repositorio.

## Instalación

```bash
npm install -g @ajax-16/vit
```

Verifica la instalación:

```bash
vit
```

---

## Uso

Ejecuta `vit` en la raíz de tu proyecto. VIT buscará un archivo `vit-config.json` en el directorio actual. Si no existe, usará la configuración por defecto.

```
  VIT   Version It!  v1.0.0

  VCS            : git
  Current branch : main
  Last tag       : v1.2.3

? Welcome. What do you want to do?
  🚀  Version it!  — bump + changelog + commit
  📋  Changelog    — add or edit entries
  💾  Commit       — commit and push without bump
  ⏪  Rollback     — roll back to a tag
  ❌  Exit
```

### Acciones disponibles

| Acción | Descripción |
|---|---|
| **Version it!** | Bump de versión + changelog + commit + tag + push |
| **Changelog** | Añadir o editar entradas del changelog sin bump |
| **Commit** | Commit y push sin modificar versiones |
| **Rollback** | Revertir el repositorio a un tag anterior |

---

## Configuración — `vit-config.json`

Crea un archivo `vit-config.json` en la raíz de tu proyecto:

```json
{
  "changelog": {
    "path": "./CHANGELOG.md",
    "title": "Changelog"
  },
  "git": {
    "defaultCommitMessage": "chore: update",
    "releaseCommitMessage": "chore: release",
    "changelogCommitMessage": "docs: update changelog"
  },
  "vcs": {
    "provider": "git"
  },
  "projects": [
    {
      "id": "core",
      "label": "Core",
      "path": ".",
      "tagPrefix": "v"
    }
  ]
}
```

### `changelog`

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `path` | `string` | `./CHANGELOG.md` | Ruta al archivo de changelog |
| `title` | `string` | `Changelog` | Título del changelog |

### `git`

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `defaultCommitMessage` | `string` | `chore: update` | Mensaje por defecto para commits sin bump |
| `releaseCommitMessage` | `string` | `chore: version bump` | Mensaje por defecto para releases |
| `changelogCommitMessage` | `string` | `docs: update changelog` | Mensaje por defecto para commits de changelog |

### `vcs`

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `provider` | `string` | `git` | Proveedor VCS. Actualmente soportado: `git` |

### `projects`

Array de proyectos a gestionar. Útil para monorepos.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `string` | Identificador único del proyecto |
| `label` | `string` | Nombre legible del proyecto |
| `path` | `string` | Ruta relativa al directorio del proyecto |
| `tagPrefix` | `string` | Prefijo para los tags git (`v` → `v1.2.3`, `vback` → `vback1.2.3`) |

**Ejemplo monorepo:**

```json
"projects": [
  { "id": "backend",  "label": "Backend",  "path": "./Backend",  "tagPrefix": "vback" },
  { "id": "frontend", "label": "Frontend", "path": "./Frontend", "tagPrefix": "vfront" }
]
```

### `types` (opcional)

Personaliza los tipos de commit disponibles en el changelog. Se fusionan con los tipos por defecto.

```json
"types": [
  { "value": "feat",   "label": "🚀 Funcionalidades", "choiceLabel": "🚀 feat     — Nueva funcionalidad" },
  { "value": "fix",    "label": "🐛 Correcciones",    "choiceLabel": "🐛 fix      — Corrección de bug" },
  { "value": "chore",  "label": "🔧 Mantenimiento",   "choiceLabel": "🔧 chore    — Mantenimiento" },
  { "value": "deploy", "label": "🌍 Despliegue",      "choiceLabel": "🌍 deploy   — Despliegue / infra" }
]
```

Tipos incluidos por defecto: `feat`, `fix`, `refactor`, `perf`, `revert`, `docs`, `style`.

---

## Pre-actions y Post-actions

VIT permite ejecutar comandos automáticamente antes (`preActions`) y después (`postActions`) de cada operación.

```json
{
  "preActions": [...],
  "postActions": [...]
}
```

### Estructura de una action

```json
{
  "id": "mi-accion",
  "label": "Descripción visible",
  "on": ["release", "commit"],
  "cwd": "./Backend",
  "continueOnError": false,
  "showOutput": true,
  "timeoutMs": 30000,
  "env": {
    "NODE_ENV": "production"
  },
  "promptEnv": [
    { "name": "SSH_PASS", "message": "Contraseña SSH:" }
  ],
  "pipeline": [...],
  "command": "npm test"
}
```

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `id` | `string` | auto | Identificador único |
| `label` | `string` | `command` | Texto mostrado en el spinner |
| `on` | `string[]` | `["release"]` | Triggers: `release`, `commit`, `changelog` |
| `cwd` | `string` | `.` | Directorio de trabajo del comando |
| `continueOnError` | `boolean` | `false` | Si `true`, un error no detiene la ejecución |
| `showOutput` | `boolean` | `true` | Mostrar stdout/stderr en tiempo real |
| `timeoutMs` | `number` | `null` | Timeout en ms. `null` = sin límite |
| `env` | `object` | `{}` | Variables de entorno adicionales |
| `promptEnv` | `array` | `[]` | Variables que se piden interactivamente al usuario |
| `pipeline` | `array` | `[]` | Pasos previos que enriquecen el entorno del comando |
| `command` | `string` | — | Comando principal a ejecutar |

### Triggers disponibles

| Trigger | Cuándo se ejecuta |
|---|---|
| `release` | Al hacer bump de versión |
| `commit` | Al hacer commit sin bump |
| `changelog` | Al hacer commit de changelog |

### `promptEnv`

Permite pedir valores sensibles (contraseñas, OTPs) justo antes de ejecutar la acción, sin guardarlos en ningún archivo.

```json
"promptEnv": [
  { "name": "SSH_PASS", "message": "Contraseña SSH del servidor:" },
  { "name": "OTP_CODE", "message": "Código OTP:", "validate": "otp" }
]
```

Usa `"validate": "otp"` para validar que el valor sea un código de 6 dígitos.

---

## Pipeline de pasos

El `pipeline` de una action es una lista de comandos que se ejecutan **antes** del `command` principal. Cada paso puede capturar su stdout como variable de entorno disponible para los pasos siguientes y para el `command` final mediante interpolación `${VAR}`.

```json
"pipeline": [
  {
    "id": "node-version",
    "command": "node -e \"process.stdout.write(process.versions.node)\"",
    "captureAs": "NODE_VERSION"
  },
  {
    "id": "git-branch",
    "command": "git rev-parse --abbrev-ref HEAD",
    "captureAs": "GIT_BRANCH"
  }
],
"command": "node -e \"console.log('Node: ${NODE_VERSION} — Rama: ${GIT_BRANCH}')\""
```

### Campos de un paso de pipeline

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `id` | `string` | auto | Identificador único |
| `label` | `string` | `command` | Texto mostrado en el spinner |
| `command` | `string` | — | Comando a ejecutar |
| `captureAs` | `string` | `null` | Variable donde guardar el stdout |
| `cwd` | `string` | `process.cwd()` | Directorio de trabajo |
| `continueOnError` | `boolean` | `false` | Si `true`, un error no detiene el pipeline |
| `showOutput` | `boolean` | `false` | Mostrar stdout (normalmente innecesario en pipeline steps) |
| `timeoutMs` | `number` | `null` | Timeout en ms |

> **Nota:** Los pasos del pipeline tienen `showOutput: false` por defecto porque su propósito es capturar valores. El `command` principal de la action tiene `showOutput: true` por defecto.

---

## Pipeline vs. múltiples actions

Esta es la distinción más importante a la hora de diseñar tu configuración.

### Pipeline — pasos dentro de una action

- Todos los pasos **comparten el mismo entorno acumulado**: lo que captura el paso 1 lo puede usar el paso 3 y el `command` final.
- Se ejecutan en serie dentro de la misma action.
- Su propósito es **preparar datos dinámicos** para construir el comando principal.
- No tienen `on`, `promptEnv` ni `env` propios — heredan todo de la action padre.

### Múltiples actions — tareas independientes

- Cada action tiene su propio `on`, `cwd`, `env`, `promptEnv`, `showOutput` y `timeoutMs`.
- Cada una aparece como un bloque separado con su propio spinner y label en la UI.
- **No comparten variables** entre sí.
- Son conceptualmente tareas distintas: tests, build, deploy, notificación...

### Regla práctica

| Situación | Usa |
|---|---|
| Necesito el resultado del paso A para construir el comando B | `pipeline` |
| Son tareas independientes que podrían ejecutarse por separado | actions separadas |
| Quiero que cada tarea tenga su propio label y spinner bien visible | actions separadas |
| Quiero preparar contexto antes de un comando complejo | `pipeline` |

---

## Ejemplos avanzados

### Bloquear release si la rama no es `main`

Captura el branch actual y aborta si no es el correcto, sin depender de lógica externa al proyecto.

```json
{
  "id": "check-branch",
  "label": "Verificar rama",
  "on": ["release"],
  "showOutput": false,
  "pipeline": [
    {
      "command": "git rev-parse --abbrev-ref HEAD",
      "captureAs": "GIT_BRANCH"
    }
  ],
  "command": "node -e \"if ('${GIT_BRANCH}' !== 'main') { console.error('ERROR: Solo se puede hacer release desde main (rama actual: ${GIT_BRANCH})'); process.exit(1); }\""
}
```

---

### Build de Docker con tag de versión automático

Captura la versión del `package.json` en tiempo de ejecución para etiquetar la imagen Docker correctamente.

```json
{
  "id": "docker-build",
  "label": "Build Docker",
  "on": ["release"],
  "showOutput": true,
  "pipeline": [
    {
      "command": "node -e \"process.stdout.write(require('./package.json').version)\"",
      "captureAs": "VERSION"
    },
    {
      "command": "node -e \"process.stdout.write(require('./package.json').name)\"",
      "captureAs": "APP_NAME"
    }
  ],
  "command": "docker build -t ${APP_NAME}:${VERSION} -t ${APP_NAME}:latest ."
}
```

---

### Deploy por SCP con contraseña pedida en tiempo real

Combina `pipeline` para construir la ruta de destino y `promptEnv` para pedir la contraseña SSH sin guardarla en ningún sitio.

```json
{
  "id": "deploy-production",
  "label": "Deploy a producción",
  "on": ["release"],
  "showOutput": true,
  "promptEnv": [
    { "name": "SSH_PASS", "message": "Contraseña SSH del servidor de producción:" }
  ],
  "pipeline": [
    {
      "command": "node -e \"process.stdout.write(require('./package.json').version)\"",
      "captureAs": "VERSION"
    },
    {
      "command": "node -e \"process.stdout.write(new Date().toISOString().slice(0,10).replace(/-/g,''))\"",
      "captureAs": "DATE"
    }
  ],
  "command": "sshpass -p ${SSH_PASS} scp -r ./dist user@produccion.miserver.com:/var/www/releases/${VERSION}-${DATE}"
}
```

---

### Generar release notes automáticas desde los commits

Captura el último tag git y genera un archivo con todos los commits desde ese tag hasta HEAD.

```json
{
  "id": "release-notes",
  "label": "Generar release notes",
  "on": ["release"],
  "showOutput": false,
  "pipeline": [
    {
      "command": "git describe --tags --abbrev=0 HEAD~1",
      "captureAs": "LAST_TAG",
      "continueOnError": true
    },
    {
      "command": "node -e \"process.stdout.write(require('./package.json').version)\"",
      "captureAs": "VERSION"
    }
  ],
  "command": "git log ${LAST_TAG}..HEAD --pretty=format:\"- %s (%an)\" > ./releases/notes-v${VERSION}.md"
}
```

---

### Publicar en npm solo si la versión no existe ya

Verifica si la versión ya está publicada antes de hacer `npm publish`, evitando errores en pipelines de CI.

```json
{
  "id": "npm-publish",
  "label": "Publicar en npm",
  "on": ["release"],
  "showOutput": true,
  "pipeline": [
    {
      "command": "node -e \"process.stdout.write(require('./package.json').version)\"",
      "captureAs": "VERSION"
    },
    {
      "command": "node -e \"process.stdout.write(require('./package.json').name)\"",
      "captureAs": "PKG_NAME"
    },
    {
      "id": "check-published",
      "command": "npm view ${PKG_NAME}@${VERSION} version",
      "captureAs": "PUBLISHED_VERSION",
      "continueOnError": true
    }
  ],
  "command": "node -e \"if ('${PUBLISHED_VERSION}' === '${VERSION}') { console.log('Versión ${VERSION} ya publicada, saltando.'); process.exit(0); } require('child_process').execSync('npm publish', { stdio: 'inherit' });\""
}
```

---

### Notificación a Slack al terminar un release

Envía un mensaje a un canal de Slack con la versión publicada, la rama y la fecha, usando solo `curl`.

```json
{
  "id": "notify-slack",
  "label": "Notificar Slack",
  "on": ["release"],
  "continueOnError": true,
  "showOutput": false,
  "promptEnv": [
    { "name": "SLACK_WEBHOOK", "message": "Webhook URL de Slack:" }
  ],
  "pipeline": [
    {
      "command": "node -e \"process.stdout.write(require('./package.json').version)\"",
      "captureAs": "VERSION"
    },
    {
      "command": "git rev-parse --abbrev-ref HEAD",
      "captureAs": "BRANCH"
    },
    {
      "command": "node -e \"process.stdout.write(new Date().toISOString().slice(0,16).replace('T',' '))\"",
      "captureAs": "DATE"
    }
  ],
  "command": "curl -s -X POST ${SLACK_WEBHOOK} -H 'Content-type: application/json' --data '{\"text\":\"🚀 *Release v${VERSION}* publicado desde `${BRANCH}` el ${DATE}\"}'"
}
```

---

### Monorepo completo: preflight + tests + build + deploy + resumen

Ejemplo de configuración completa para un monorepo con backend y frontend.

```json
{
  "projects": [
    { "id": "backend",  "label": "Backend",  "path": "./Backend",  "tagPrefix": "vback" },
    { "id": "frontend", "label": "Frontend", "path": "./Frontend", "tagPrefix": "vfront" }
  ],
  "preActions": [
    {
      "id": "check-branch",
      "label": "Verificar rama",
      "on": ["release"],
      "showOutput": false,
      "pipeline": [
        { "command": "git rev-parse --abbrev-ref HEAD", "captureAs": "BRANCH" }
      ],
      "command": "node -e \"if ('${BRANCH}' !== 'main') { console.error('Solo desde main'); process.exit(1); }\""
    },
    {
      "id": "test-backend",
      "label": "Tests del Backend",
      "on": ["release"],
      "cwd": "./Backend",
      "continueOnError": false,
      "showOutput": true,
      "command": "npm test"
    },
    {
      "id": "build-frontend",
      "label": "Build del Frontend",
      "on": ["release"],
      "cwd": "./Frontend",
      "continueOnError": false,
      "showOutput": true,
      "command": "npm run build"
    }
  ],
  "postActions": [
    {
      "id": "deploy",
      "label": "Deploy a producción",
      "on": ["release"],
      "showOutput": true,
      "promptEnv": [
        { "name": "SSH_PASS", "message": "Contraseña SSH:" },
        { "name": "OTP",      "message": "Código OTP:", "validate": "otp" }
      ],
      "pipeline": [
        { "command": "node -e \"process.stdout.write(require('./Backend/package.json').version)\"",  "captureAs": "BACK_VERSION" },
        { "command": "node -e \"process.stdout.write(require('./Frontend/package.json').version)\"", "captureAs": "FRONT_VERSION" }
      ],
      "command": "sshpass -p ${SSH_PASS} ssh user@produccion.miserver.com \"cd /var/www && ./deploy.sh ${BACK_VERSION} ${FRONT_VERSION} ${OTP}\""
    },
    {
      "id": "summary",
      "label": "Resumen del release",
      "on": ["release"],
      "continueOnError": true,
      "showOutput": false,
      "pipeline": [
        { "command": "node -e \"process.stdout.write(require('./Backend/package.json').version)\"",  "captureAs": "BACK_VERSION" },
        { "command": "node -e \"process.stdout.write(require('./Frontend/package.json').version)\"", "captureAs": "FRONT_VERSION" },
        { "command": "git rev-parse --abbrev-ref HEAD", "captureAs": "BRANCH" },
        { "command": "node -e \"process.stdout.write(new Date().toISOString().slice(0,16).replace('T',' '))\"", "captureAs": "DATE" }
      ],
      "command": "node -e \"console.log('\\n  ✅ Release completado\\n  Backend  : v${BACK_VERSION}\\n  Frontend : v${FRONT_VERSION}\\n  Rama     : ${BRANCH}\\n  Fecha    : ${DATE}\\n')\""
    }
  ]
}
```

---

## Manejo de errores

Cuando un comando falla, VIT muestra un mensaje limpio y guarda el stack trace completo en un archivo de log temporal:

```
  ERROR   "Tests" failed (exit 1)

  Log guardado en:
  C:\Users\user\AppData\Local\Temp\vit-logs\vit-error-1745678912345.log
```

Los logs se guardan en `{tmpdir}/vit-logs/` con el formato `vit-error-{timestamp}.log`.

---

## Requisitos

- Node.js >= 18
- Git instalado y configurado

---

## Licencia

MIT
