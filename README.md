# VIT

CLI interactivo de versionado y changelog.

## Uso

```bash
# Desde la raíz del proyecto
node vit.js

```

## Estructura

```
version-manager/
├── version-manager.js   ← Entrada principal, menú
├── lib/
│   ├── bump.js          ← npm version + git commit/tag/push
│   ├── changelog.js     ← Construcción manual del CHANGELOG.md
│   └── git.js           ← Wrappers de comandos git
└── package.json
```

## CHANGELOG.md

El fichero `CHANGELOG.md` se genera en la **raíz del repositorio**.
Cada entrada que añadas manualmente se **antepone** al contenido existente,
manteniendo el historial completo.
