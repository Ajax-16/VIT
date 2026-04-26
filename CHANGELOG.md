# Registro de cambios

## [0.0.3] - 26/04/2026

### 🎨 Styles

- *(Idioma)* Modificado idioma del cli para ser más accesible en general.



## [0.0.2] - 25/04/2026

### 🐛 Corrección de errores

- Modificado README.md

## [0.0.1] - 25/04/2026

> Primera versión pública de VIT - Version It! CLI para versionado inteligente de proyectos npm.

### 🚀 Funcionalidades

- Sistema de versionado npm con bumps `patch`, `minor` y `major`

- Configuración por `vit-config.json`

- Soporte para uno o varios proyectos configurables

- Generación y edición interactiva de changelog

- Sistema de tags configurable por proyecto mediante `tagPrefix`

- Integración con VCS configurable

- Soporte para `git` y modo `none` sin repositorio

- Commit, tag y push automáticos cuando el proveedor VCS lo permite

- Rollback a tags desde CLI cuando el proveedor VCS lo soporta

### ⚡ Rendimiento

- Uso de `child_process` nativo para ejecutar operaciones de versionado y VCS

- Resolución simple y directa de proyectos desde `process.cwd()`

### 🎨 Estilos

- Interfaz CLI coloreada con `chalk`

- Spinners de estado con `ora`

- Prompts interactivos con `inquirer`

- Resúmenes claros antes de ejecutar operaciones
