# 00_Foundation (зафиксировано по текущим скриншотам)

Источник: скриншоты от пользователя в чате (актуально на 2026-03-09).

Этот документ обязателен для всех новых страниц и новых UI-блоков в `treed-shell`.
Если элемент нельзя корректно описать через этот foundation, сначала обновляется foundation, потом добавляется элемент.

## 1) Смысловой блок Foundation

- Заголовок: `00_Foundation`
- Подзаголовок: `TreeD Screen — промышленный тач-интерфейс для 3D-принтера`

### Design Principles

- `Industrial & Minimal`:
  `Технологичный минималистичный стиль без маркетинговых градиентов`
- `AMOLED Optimized`:
  `Глубокий чёрный фон (#000000) для контрастности и энергоэффективности`
- `Touch-First`:
  `Все элементы минимум 56px высотой, оптимизированы для тач-управления`

## 2) TreeD Brand Colors (токены)

- `Background`: `#000000`
- `Surface`: `#000000`
- `Block Surface`: `#171A1F`
- `Surface Elevated`: `#1F2229`
- `Primary`: `#9163FF`
- `Primary Light`: `#A881FF`
- `Primary Dark`: `#7B4EEA`
- `Success`: `#2ECC71`
- `Warning`: `#F5A623`
- `Error`: `#E74C3C`
- `Text Primary`: `#FFFFFF`
- `Text Secondary`: `#959799`

### Support UI Tokens

- `Window Background`: `#2B2F36`
- `Border Subtle`: `#242B3C`
- `Border Default`: `#2B3347`
- `Surface Track`: `#0F131D`
- `Text Soft`: `#959799`
- `Overlay`: `rgba(5, 8, 14, 0.68)`

### Правило оптимизации палитры

- Близкие тёмные оттенки не размножать локально по компонентам.
- Для поверхностей использовать `Background / Surface / Block Surface / Surface Elevated`.
- Для контуров использовать только `Border Subtle` и `Border Default`, если нет явно согласованного исключения.
- Для вторичного числового текста и unit-частей использовать `Text Soft`, а не новые одноразовые оттенки.

## 3) Typography Scale

- `Heading Large` (Main values): `28px / 500`
- `Heading Medium` (Section titles): `22px / 500`
- `Body Large` (Card headers): `20px / 500`
- `Body` (Default text): `16px / 400`
- `Small` (Labels): `14px / 400`
- `Tiny` (Meta info): `12px / 400`

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
