# Contributing to Glyph

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Foundry VTT](https://foundryvtt.com/) source (for intellisense)

## Getting Started

```bash
npm install
npm run setup
npm run build
```

`npm run setup` creates two symlinks:

- `foundry/` → your Foundry VTT source (set `FOUNDRY_PATH` or enter when prompted) — powers `@client/*` / `@common/*` intellisense.
- `dnd5e/` → `../dnd5e` (sibling repo) — system reference for intellisense.

`npm run build` writes the built module to `dist/`. Symlink or copy `dist/` into your Foundry data folder's `Data/modules/glyph`, then enable Glyph in Foundry. Use `npm run build:watch` while developing for incremental rebuilds.

## Commands

| Command                 | Description                         |
| ----------------------- | ----------------------------------- |
| `npm run build`         | Production build to `dist/`         |
| `npm run build:watch`   | Watch mode rebuild                  |
| `npm run dev`           | Development build (no minification) |
| `npm run clean`         | Remove `dist/`                      |
| `npm run lint`          | Run ESLint                          |
| `npm run lint:fix`      | Run ESLint with auto-fix            |
| `npm run format`        | Format with Prettier                |
| `npm run format:check`  | Check formatting                    |
| `npm run stylelint`     | Lint CSS                            |
| `npm run stylelint:fix` | Lint CSS with auto-fix              |
| `npm run validate`      | Run lint + format check + stylelint |

## Code Style

- **JavaScript** — ESLint + Prettier (`eslint.config.mjs`, `.prettierrc`)
- **CSS** — Stylelint (`.stylelintrc.json`). Use `rem`/`em` units, not `px`.
- **JSON** — Prettier ignores JSON files (managed manually).
- **Templates** — Handlebars (`.hbs`). Excluded from Prettier.
- **JSDoc** — Required on all functions/methods/classes. Follow existing patterns.
- **Localization** — Only add or update keys in `lang/en.json`. Other language files are managed via Weblate.

## Pre-commit Hook

The repo installs no hook of its own. On the maintainer machine a global git hook runs [lint-staged](https://github.com/lint-staged/lint-staged) when `node_modules` is present, auto-fixing staged files; contributors without it should run `npm run validate` before pushing. lint-staged covers:

- **JS/MJS** — Prettier + ESLint
- **CSS** — Prettier + Stylelint
- **YAML** — Prettier

If a lint error can't be auto-fixed, the commit is blocked until you fix it manually.

## Submitting Changes

All pull requests **must** reference an open issue. Open one first if none exists.

1. Fork the repository and create a branch from `main`.
2. Make your changes in focused, logical commits.
3. Run `npm run validate`.
4. Open a pull request against `main` and reference the issue (e.g. `Closes #123`).

## Reporting Issues

Use [GitHub Issues](../../issues) with the appropriate template:

- **Bug Report** — defects or unexpected behavior
- **Feature Request** — new functionality or enhancements

Include steps to reproduce, expected vs actual behavior, and your Foundry VTT version.

## License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
