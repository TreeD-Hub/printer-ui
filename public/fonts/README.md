# `public/fonts`

Локальные файлы шрифтов и лицензии экранного UI.

## Подключено сейчас

- `nothing-font.otf` - `Nothing Font`, accent font для брендовых элементов.
- `jetbrains-mono-variable.ttf` - `JetBrains Mono`, основной UI mono font.

Оба шрифта подключаются в `src/styles/foundation.css` через `@font-face`.

## Содержимое

- `nothing-font.otf`
- `nothing-font-readme.txt`
- `nothing-font-license.txt`
- `jetbrains-mono-variable.ttf`
- `jetbrains-mono-readme.txt`
- `jetbrains-mono-license.txt`
- `handjet-variable.ttf`
- `handjet-readme.txt`
- `handjet-license.txt`

`Handjet` хранится в репозитории, но не подключён в `foundation.css`.

## Лицензии

- `JetBrains Mono`: SIL Open Font License 1.1, см. `jetbrains-mono-license.txt`.
- `Nothing Font`: SIL Open Font License 1.1, см. `nothing-font-license.txt`.
- `Handjet`: см. `handjet-license.txt`.

При распространении шрифтов и модификаций сохранять соответствующие тексты лицензий.

Настройка `@font-face`: [`foundation.css`](../../src/styles/foundation.css).
Общий порядок работы со стилями: [README стилей](../../src/styles/README.md).
