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
  `Все элементы минимум 56px высотой, оптимизированы для тач-управления`
- `Red As Signal`:
  `Красный используется как точечный статус/опасность, а не как декоративная заливка интерфейса`

## 2) TreeD Brand Colors (токены)

- `Background`: `#050607`
- `Surface`: `#090B0D`
- `Block Surface`: `#0D1012`
- `Surface Elevated`: `#14181B`
- `Primary`: `#FF2A2A`
- `Primary Light`: `#FF5A5A`
- `Primary Dark`: `#B91414`
- `Success`: `#D9F7E5`
- `Warning`: `#FFF0B8`
- `Error`: `#FF2A2A`
- `Text Primary`: `#F4F4F0`
- `Text Secondary`: `#C9CBC7`

### Support UI Tokens

- `Window Background`: `#11161C`
- `Border Subtle`: `#24282B`
- `Border Default`: `#3A3F43`
- `Surface Track`: `#030405`
- `Text Soft`: `#90948F`
- `Overlay`: `rgba(2, 3, 4, 0.78)`
- `Terminal Grid Dot`: `rgba(244, 244, 240, 0.11)`
- `Terminal Scanline`: `rgba(244, 244, 240, 0.035)`
- `Terminal Border Active`: `rgba(244, 244, 240, 0.86)`

### Правило оптимизации палитры

- Близкие тёмные оттенки не размножать локально по компонентам.
- Для поверхностей использовать `Background / Surface / Block Surface / Surface Elevated`.
- Для контуров использовать только `Border Subtle` и `Border Default`, если нет явно согласованного исключения.
- Для вторичного числового текста и unit-частей использовать `Text Soft`, а не новые одноразовые оттенки.
- Для активных неопасных элементов использовать белую/серую рамку и тонкую подсветку; красный оставлять для точки состояния, питания, stop/cancel и ошибок.
- Запрещены фиолетовые/синие декоративные glow-эффекты старого foundation.

## 3) Typography Scale

- `Heading Large` (Top brand / Main values): `28-32px / 400`
- `Heading Medium` (Section titles): `22px / 400`
- `Body Large` (Card headers): `20px / 400`
- `Body` (Default text): `16px / 400`
- `Small` (Labels): `14px / 400`
- `Tiny` (Meta info): `12px / 400`

Шрифтовой контракт:
- базовый UI: моноширинный системный стек `Cascadia Mono / Consolas / Courier New`;
- крупные брендовые/навигационные надписи: CSS dot-matrix эффект через text clip;
- мелкие метрики и поля ввода остаются читаемыми моноширинными, без чрезмерного dot-clip.

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
