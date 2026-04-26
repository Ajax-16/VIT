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

## Ejemplo completo

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
  "vcs": { "provider": "git" },
  "projects": [
    { "id": "vit", "label": "VIT", "path": ".", "tagPrefix": "v" }
  ],
  "types": [
    { "value": "feat",  "label": "🚀 Funcionalidades", "choiceLabel": "🚀 feat   — Nueva funcionalidad" },
    { "value": "fix",   "label": "🐛 Correcciones",    "choiceLabel": "🐛 fix    — Corrección de bug" },
    { "value": "chore", "label": "🔧 Mantenimiento",   "choiceLabel": "🔧 chore  — Mantenimiento" }
  ],
  "preActions": [
    {
      "id": "preflight",
      "label": "Preflight checks",
      "on": ["release", "commit"],
      "showOutput": false,
      "pipeline": [
        { "command": "node -e \"process.stdout.write(process.versions.node)\"",            "captureAs": "NODE_VERSION" },
        { "command": "git rev-parse --abbrev-ref HEAD",                                     "captureAs": "GIT_BRANCH" },
        { "command": "node -e \"process.stdout.write(require('./package.json').version)\"", "captureAs": "CURRENT_VERSION" }
      ],
      "command": "node -e \"console.log('  Node: ${NODE_VERSION}  |  Branch: ${GIT_BRANCH}  |  Version: ${CURRENT_VERSION}')\""
    },
    {
      "id": "tests",
      "label": "Tests",
      "on": ["release"],
      "continueOnError": false,
      "showOutput": true,
      "command": "npm test"
    }
  ],
  "postActions": [
    {
      "id": "release-summary",
      "label": "Release summary",
      "on": ["release"],
      "showOutput": false,
      "pipeline": [
        { "command": "node -e \"process.stdout.write(require('./package.json').version)\"",  "captureAs": "NEW_VERSION" },
        { "command": "git describe --tags --abbrev=0",                                        "captureAs": "LAST_TAG",  "continueOnError": true },
        { "command": "node -e \"process.stdout.write(new Date().toISOString().slice(0,10))\"", "captureAs": "RELEASE_DATE" }
      ],
      "command": "node -e \"console.log('  🎉 Released v${NEW_VERSION} (${LAST_TAG}) — ${RELEASE_DATE}')\""
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
