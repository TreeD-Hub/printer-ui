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
  `Глубокий чёрный фон (#0E0F12) для контрастности и энергоэффективности`
- `Touch-First`:
  `Все элементы минимум 56px высотой, оптимизированы для тач-управления`

## 2) TreeD Brand Colors (токены)

- `Background`: `#0E0F12`
- `Surface`: `#171A1F`
- `Surface Elevated`: `#1F2229`
- `Primary`: `#9163FF`
- `Primary Light`: `#A881FF`
- `Primary Dark`: `#7B4EEA`
- `Success`: `#2ECC71`
- `Warning`: `#F5A623`
- `Error`: `#E74C3C`
- `Text Primary`: `#FFFFFF`
- `Text Secondary`: `#A0A6B0`

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
