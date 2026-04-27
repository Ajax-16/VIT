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

## Argumentos CLI

Puedes pasar argumentos directamente al ejecutar `vit` para saltarte pasos del flujo interactivo. Los prompts que ya tienen valor por argumento se omiten; el resto se siguen mostrando normalmente.

```bash
vit [comando] [opciones]
```

### Comandos

| Comando | Descripción |
|---|---|
| `release` | Ejecuta el flujo de release |
| `commit` | Ejecuta un commit sin bump |
| `changelog` | Abre el flujo de changelog |
| `rollback` | Revierte a un tag anterior |

### Opciones

| Opción | Alias | Descripción |
|---|---|---|
| `--bump <type>` | `-b` | Tipo de bump: `patch`, `minor` o `major` |
| `--message <msg>` | `-m` | Mensaje del commit |
| `--tag <tag>` | `-t` | Tag destino para rollback |
| `--projects <ids>` | `-p` | IDs de proyectos separados por comas (monorepo) |
| `--semantic` | `-s` | Activa modo de changelog semántico |
| `--yes` | `-y` | Confirma todo automáticamente sin prompts (modo headless) |
| `--dry-run` | `-d` | Simula la operación sin escribir ni hacer push |
| `--version` | `-v` | Muestra la versión de VIT |
| `--help` | `-h` | Muestra la ayuda |

### Comportamiento por niveles

Cada argumento saltará únicamente el prompt correspondiente; el resto del flujo interactivo continúa con normalidad.

| Comando | Qué se salta | Qué sigue preguntando |
|---|---|---|
| `vit release` | Menú principal | Bump type, changelog, mensaje, confirmación |
| `vit release --bump patch` | Menú + bump type | Changelog, mensaje, confirmación |
| `vit release --bump patch --message "fix"` | Menú + bump + mensaje | Changelog, confirmación |
| `vit release --bump patch --yes` | Todo (headless completo) | Nada |
| `vit commit --yes` | Todo (usa mensaje por defecto) | Nada |
| `vit changelog --semantic --yes` | Todo (usa commits de cada tag para regenerar todo el changelog) | Nada |
| `vit rollback --tag v1.2.3` | Menú + selector de tag | Confirmación |
| `vit rollback --tag v1.2.3 --yes` | Todo (headless completo) | Nada |

> **Nota:** `--yes` solo activa el modo headless completo si se combina con un comando. Sin `--yes`, cada argumento saltará su prompt correspondiente pero el resto del flujo seguirá siendo interactivo.

### Ejemplos

```bash
# Release interactivo desde el menú
vit

# Release saltando el menú, pregunta el resto
vit release

# Release con bump fijado, sigue preguntando changelog y confirmación
vit release --bump minor

# Release completamente automático (headless)
vit release --bump patch --yes

# Commit automático con mensaje por defecto
vit commit --yes

# Commit automático con mensaje personalizado
vit commit --message "fix: typo" --yes

# Rollback a un tag concreto sin confirmar
vit rollback --tag v1.2.3 --yes

# Simular un release sin escribir nada
vit release --bump patch --dry-run

# Release en monorepo solo para el backend
vit release --bump patch --projects backend --yes
```

---

## Configuración — `vit-config.json`

Crea un archivo `vit-config.json` en la raíz de tu proyecto:

```json
{
  "changelog": {
    "path": "./CHANGELOG.md",
    "title": "Changelog",
    "semantic": false
  },
  "git": {
    "defaultCommitMessage": "chore: update",
    "releaseCommitMessage": "chore: release",
    "changelogCommitMessage": "docs: update changelog",
    "releaseBranches": ["main"],
    "strict": false,
    "rollbackStrategy": "revert"
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
| `semantic` | `boolean` | `false` | Si `true`, el changelog se genera automáticamente a partir de los commits usando [Conventional Commits](https://www.conventionalcommits.org/) |

#### Changelog semántico

Cuando `semantic: true`, VIT analiza el historial de commits desde el último tag y genera el changelog automáticamente agrupando los commits por tipo (`feat`, `fix`, `refactor`…). El formato esperado en los mensajes de commit es:

```
<tipo>(<scope opcional>): <descripción>
```

Ejemplos válidos:

```
feat: nueva pantalla de login
fix(api): corregir timeout en peticiones lentas
refactor(auth): extraer lógica de validación
```

Los commits que no sigan este formato son ignorados automáticamente.

**Flujo interactivo** — VIT muestra los commits detectados, permite deseleccionar los que no quieras incluir y solicita opcionalmente un texto introductorio antes de guardar.

**Modo headless** — el changelog se regenera silenciosamente sin prompts.

```json
"changelog": {
  "path": "./CHANGELOG.md",
  "title": "Changelog",
  "semantic": true
}
```

### `git`

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `defaultCommitMessage` | `string` | `chore: update` | Mensaje por defecto para commits sin bump |
| `releaseCommitMessage` | `string` | `chore: version bump` | Mensaje por defecto para releases |
| `changelogCommitMessage` | `string` | `docs: update changelog` | Mensaje por defecto para commits de changelog |
| `releaseBranches` | `string[]` | `[]` | Ramas desde las que se permite hacer release |
| `strict` | `boolean` | `false` | Si `true`, bloquea el release al detectar una rama no permitida |
| `rollbackStrategy` | `string` | `"revert"` | Estrategia de rollback: `"revert"` (por defecto) o `"reset"` |

#### Control de ramas para releases

Puedes restringir desde qué ramas se puede ejecutar un release mediante `releaseBranches` y `strict`.

**Modo advertencia** (`strict: false`, por defecto)

Si estás en una rama no permitida, VIT muestra un aviso y pregunta si quieres continuar de todas formas:

```
  WARNING   You are on branch "feat/my-feature", not on a release branch.
  Configured release branches: main

? Continue anyway? (y/N)
```

Con `--yes` o en modo headless se acepta automáticamente el aviso y el release continúa.

**Modo estricto** (`strict: true`)

Si estás en una rama no permitida, el release queda bloqueado y VIT termina con error:

```
  BLOCKED   Releases are not allowed from branch "feat/my-feature".
  Allowed branches: main
```

En modo `--dry-run`, el bloqueo estricto se ignora para permitir simulaciones desde cualquier rama.

**Ejemplo con múltiples ramas permitidas:**

```json
"git": {
  "releaseBranches": ["main", "release", "hotfix"],
  "strict": true
}
```

#### Estrategia de rollback

`rollbackStrategy` controla cómo VIT deshace los cambios al hacer un rollback a un tag anterior.

Antes de ejecutar cualquier acción, VIT muestra siempre un **preview de los commits afectados** junto con la estrategia activa:

```
  Commits that will be rolled back:  (strategy: revert)
  ─────────────────────────────────────────────────────
  · feat: nueva pantalla de login
  · fix: corregir bug en el formulario
  · chore: release v1.1.0

  Strategy  : revert — creates a new commit, history preserved
  Target tag: v1.0.0 (3 commit(s) affected)
```

**`"revert"` (por defecto)** — crea un nuevo commit que deshace los cambios. La historia de git se mantiene intacta y se puede hacer push normal sin `--force`. Recomendado para repos compartidos con otros colaboradores.

**`"reset"`** — mueve el puntero HEAD al tag destino, reescribiendo la historia. Requiere force push (`git push --force`). Usar solo en repos personales o ramas propias.

```json
"git": {
  "rollbackStrategy": "revert"
}
```

> **Nota:** Con la estrategia `reset`, VIT también ofrece eliminar los tags que quedaron por encima del tag destino, ya que apuntarían a commits que ya no existen en la historia local.

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

### `envFile` (opcional)

Ruta a un archivo `.env` global cuyas variables estarán disponibles en **todas** las actions. Las variables del archivo tienen menor prioridad que `env` y `promptEnv` definidos en cada action.

```json
{
  "envFile": ".env"
}
```

Ver [Variables de entorno y `envFile`](#variables-de-entorno-y-envfile) para más detalles.

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
  "envFile": ".env.production",
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
| `envFile` | `string` | `null` | Ruta a un `.env` específico para esta action (mayor prioridad que el `envFile` global) |
| `env` | `object` | `{}` | Variables de entorno estáticas (mayor prioridad que `envFile`) |
| `promptEnv` | `array` | `[]` | Variables que se piden interactivamente al usuario (máxima prioridad) |
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

> **Nota:** promptEnv tiene prioridad máxima en VIT. Esto significa que, aunque ejecutemos vit en modo headless, el proceso parará hasta que reciba input del usuario.

---

## Variables de entorno y `envFile`

VIT soporta cargar variables de entorno desde archivos `.env` en dos niveles: **global** (para todas las actions) y **por action** (solo para esa action). Las variables del nivel más cercano tienen prioridad.

### Orden de prioridad (menor → mayor)

```
process.env  →  envFile global  →  envFile de action  →  action.env  →  promptEnv
```

### `envFile` global

Se define en la raíz del `vit-config.json`. Sus variables están disponibles en todas las actions.

```json
{
  "envFile": ".env",
  "preActions": [...]
}
```

### `envFile` por action

Se define dentro de una action concreta. Sobreescribe las variables del `envFile` global con el mismo nombre.

```json
{
  "id": "deploy",
  "envFile": ".env.production",
  "command": "scp ./dist ${DEPLOY_USER}@${SERVER_HOST}:/var/www"
}
```

### Ejemplo completo

**`vit-config.json`:**
```json
{
  "envFile": ".env",
  "postActions": [
    {
      "id": "deploy",
      "label": "Deploy a producción",
      "on": ["release"],
      "envFile": ".env.production",
      "command": "echo Desplegando como ${DEPLOY_USER} en ${APP_ENV}"
    }
  ]
}
```

**`.env`** (disponible para todas las actions):
```env
APP_ENV=development
DEPLOY_USER=dev
```

**`.env.production`** (solo para la action `deploy`, sobreescribe `.env`):
```env
APP_ENV=production
DEPLOY_USER=deploy-bot
```

En la action `deploy`, `APP_ENV` será `production` y `DEPLOY_USER` será `deploy-bot` porque `.env.production` tiene prioridad sobre `.env`.

> **Nota:** Los archivos `.env` se parsean internamente sin necesidad de instalar `dotenv`. Se soportan comentarios (`# comentario`), líneas vacías y valores con comillas simples o dobles.

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

- Cada action tiene su propio `on`, `cwd`, `env`, `envFile`, `promptEnv`, `showOutput` y `timeoutMs`.
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

### Deploy con variables de entorno desde archivo

Usa `envFile` por action para cargar credenciales de producción sin exponerlas en el config.

```json
{
  "id": "deploy-production",
  "label": "Deploy a producción",
  "on": ["release"],
  "showOutput": true,
  "envFile": ".env.production",
  "pipeline": [
    {
      "command": "node -e \"process.stdout.write(require('./package.json').version)\"",
      "captureAs": "VERSION"
    }
  ],
  "command": "scp -r ./dist ${DEPLOY_USER}@${SERVER_HOST}:/var/www/releases/${VERSION}"
}
```

**`.env.production`:**
```env
DEPLOY_USER=deploy-bot
SERVER_HOST=produccion.miservidor.com
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
  "envFile": ".env",
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
      "envFile": ".env.production",
      "promptEnv": [
        { "name": "SSH_PASS", "message": "Contraseña SSH:" },
        { "name": "OTP",      "message": "Código OTP:", "validate": "otp" }
      ],
      "pipeline": [
        { "command": "node -e \"process.stdout.write(require('./Backend/package.json').version)\"",  "captureAs": "BACK_VERSION" },
        { "command": "node -e \"process.stdout.write(require('./Frontend/package.json').version)\"", "captureAs": "FRONT_VERSION" }
      ],
      "command": "sshpass -p ${SSH_PASS} ssh ${DEPLOY_USER}@${SERVER_HOST} \"cd /var/www && ./deploy.sh ${BACK_VERSION} ${FRONT_VERSION} ${OTP}\""
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
