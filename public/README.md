# `public`

Статические ресурсы, которые Vite копирует в сборку без обработки.

## Состав

- [`fonts/`](fonts/README.md) — файлы шрифтов и лицензии.
- `vite.svg` - стандартный Vite asset, не часть printer UI contract.

## Правила

- Класть сюда только файлы, которые должны быть доступны по URL в runtime.
- Не хранить здесь runtime config, secrets или device-specific состояние.
- Шрифты подключаются из `src/styles/foundation.css` через `/fonts/...`.

Ресурсы, импортируемые кодом: [`src/assets`](../src/assets/README.md).
Подключение шрифтов и дизайн-токены: [README стилей](../src/styles/README.md).
