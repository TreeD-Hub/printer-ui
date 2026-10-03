# 00_Foundation (Nothing pixel terminal)

Источник: пользовательский референс Nothing/pixel/terminal в чате (актуально на 2026-05-27).

Этот документ обязателен для всех новых страниц и новых UI-блоков в `treed-shell`.
Если элемент нельзя корректно описать через этот foundation, сначала обновляется foundation, потом добавляется элемент.

## 1) Смысловой блок Foundation

- Заголовок: `00_Foundation`
- Подзаголовок: `TreeD Screen — монохромный pixel terminal UI для 3D-принтера`

### Design Principles

- `Nothing Pixel Terminal`:
  `Монохромная приборная панель с точечной графикой, тонкими рамками и терминальной типографикой`
- `AMOLED Optimized`:
  `Почти чёрный фон, мягкие серые поверхности и белый текст без цветового шума`
- `Touch-First`:
  `Интерактивные элементы имеют зону нажатия минимум 48px по ширине и 56px по высоте, оптимизированы для тач-управления`
- `Red As Signal`:
  `Красный используется как точечный статус/опасность, а не как декоративная заливка интерфейса`

## 2) TreeD Brand Colors (токены)

- `Background`: `#101213`
- `Surface`: `#101213`
- `Block Surface`: `#131517`
- `Surface Elevated`: `#14181B`
- `Primary`: `#FF2A2A`
- `Primary Light`: `#FF5A5A`
- `Primary Dark`: `#B91414`
- `Success`: `#D9F7E5`
- `Warning`: `#FFF0B8`
- `Error`: `#FF2A2A`
- `Text Primary`: `#CCCCCC`
- `Text Secondary`: `#C0C0C0`

### Support UI Tokens

- `Window Background`: `#11161C`
- `Border Subtle`: `#24282B`
- `Border Default`: `#3A3F43`
- `Surface Track`: `#030405`
- `Text Soft`: `#818181`
- `Overlay`: `rgba(2, 3, 4, 0.78)`
- `Terminal Grid Dot`: `rgba(244, 244, 240, 0.11)`
- `Terminal Scanline`: `rgba(244, 244, 240, 0.035)`
- `Terminal Border Active`: `rgba(244, 244, 240, 0.36)`

### Правило оптимизации палитры

- Близкие тёмные оттенки не размножать локально по компонентам.
- Для поверхностей использовать `Background / Surface / Block Surface / Surface Elevated`.
- Для контуров использовать только `Border Subtle` и `Border Default`, если нет явно согласованного исключения.
- Для вторичного числового текста и unit-частей использовать `Text Soft`, а не новые одноразовые оттенки.
- Для активных неопасных элементов использовать белую/серую рамку и тонкую подсветку; красный оставлять для точки состояния, питания, stop/cancel и ошибок.
- Запрещены фиолетовые/синие декоративные glow-эффекты старого foundation.

## 3) Typography Scale

- `Heading Large` (Top brand / Main values): `32px / 400`
- `Heading Medium` (Section titles): `22px / 400`
- `Body Large` (Card headers): `20px / 400`
- `Body` (Default text): `16px / 400`
- `Small` (Labels): `14px / 400`
- `Tiny` (Meta info): `12px / 400`

Шрифтовой контракт:
- В проекте загружаются ровно два шрифта: `Nothing Font` (`public/fonts/nothing-font.otf`) и `JetBrains Mono` (`public/fonts/jetbrains-mono-variable.ttf`).
- `--font-family-accent`: наш dotted Nothing Font для крупных брендовых, навигационных надписей и крупных приборных значений. Точечный рисунок уже содержится в шрифте; дополнительный text clip не нужен.
- `--font-family-ui`: обычный JetBrains Mono для кнопок, подсказок, полей, единиц, мелких метрик и сообщений. Для functional-текста не использовать dotted.
- Системные моноширинные fallback-шрифты используются только при ошибке загрузки; третьего подключаемого семейства нет.

### Общие роли и приёмы

Источник значений — `src/styles/foundation.css`; shared-поведение — `src/styles/ui-kit.css`, подключаемый после стилей экранов. UI primitives и управление фокусом находятся в существующем `src/ui`; отдельный shared-пакет для этого не требуется.

| Роль | Токены / контракт |
| --- | --- |
| Типографика | `heading-large=32`, `metric=26`, `heading-medium=22`, `body-large=20`, `body=16`, `small=14`, `tiny=12`; старые `heading`, `body-small`, `caption`, `mono` — алиасы этих ролей |
| Touch-контрол | `--control-min-width: 48px`, `--control-height: 56px`; иконка внутри может быть меньше |
| Рамка и скругление | `--border-width: 1px`, `--radius-control: 6px`, `--radius-panel: 8px` |
| Обычный выбор / включение | `--color-control-active-border`, `--color-control-active-surface`, `--color-control-active-text`; нейтральная рамка и мягкая белая подложка |
| Фокус | `--color-focus-ring`, `--focus-width: 2px`, `--focus-offset: 2px`; виден при клавиатурной навигации |
| Недоступность | приглушённый текст и рамка; причина блокировки показывается текстом, текущие значения остаются читаемыми |
| Движение | `--motion-control: 120ms`; при `prefers-reduced-motion` анимация отключена |
| Terminal-рисунок | `--terminal-grid-dot`, `--terminal-grid-line`, `--terminal-scanline`, `--terminal-panel-sheen`; без дополнительных локальных цветов |
| Интервалы | 4 / 8 / 16 / 24px; 2px — только микроинтервал |
| Модалка | начальный безопасный фокус, цикл Tab внутри, возврат фокуса при закрытии; команды и их guards принадлежат экрану |

Красный сохраняется у опасных действий, ошибок, нагрева и сигналов питания. Обычная выбранная вкладка, активный preset, переключатель, калибровочная команда и старт файла используют нейтральную роль.

## 4) Grid System

### Landscape (960x544)

- Base grid: `8pt`
- Columns: `12`
- Gutter: `16px`
- Margin: `24px`
- Safe area: `16px` от краёв

### Portrait (544x960)

- Base grid: `8pt`
- Columns: `4`
- Gutter: `16px`
- Margin: `20px`
- Safe area: `16px` от краёв

## 5) Обязательное правило применения

- Все новые страницы и новые элементы на страницах обязаны соответствовать этому foundation.
- Нельзя добавлять цвета, типографические размеры/веса и сеточные параметры вне списка выше без явного обновления `00_Foundation`.
- При визуальном расхождении приоритет у текущего пользовательского макета/скриншота; изменение фиксируется в этом документе.
