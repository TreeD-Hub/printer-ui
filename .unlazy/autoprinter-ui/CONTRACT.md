# AutoPrinter UI — контракт реализации, revision 2

Пользователь: очередь, статусы и локальное управление на экране принтера.
UI dev HEAD8639ff0b21a422c5fc27fd90dd7f1915a430d652; core dev
HEAD88d415c9517e0c42f6ffdf16d047288f863db9e2. Никаких физических действий,
SSH, установки, build/full-suite/browser/e2e, commit/push/deploy. Тесты с fakes.
Старые задания40/01 — справочный план; фактические DTO и поздние решения важнее.

## 1. Core: только необходимое локальное расширение

Существующие authenticated GET /server/treed/autoprinter/status, POST /pairing
и POST /control; новых start/file/force-empty endpoint нет. Backend wire неизменен.

GET status сохраняет все текущие поля и protocol_version/configuration_version=1.
Для paired дополнительно отдаёт:
- queue: максимум1000 строк, отсортированных по реальной runs.position;
  {run_id:UUID, position:positive int, state:RunState, series_id:UUID|null,
   copies_per_run:positive int|null}. Null только для отсутствующих legacy
  metadata; не выдумывать UUID/число копий и не пропускать такие строки.
  Только текущий binding_epoch. State из
  execution_runs, отсутствие execution state означает queued. Прямой bounded
  read-only JOIN в Store.status предпочтительнее изменения внутреннего queue().
- queue_total: число всех строк текущей привязки, queue_truncated:boolean.
  При unpaired/revoked queue=[], total=0, truncated=false. Не включать путь,
  filename, asset hash, доказательства, outbox или данные прежней привязки.
- capabilities.queue=true; capabilities.pairing=true;
  capabilities.bed_check_diagnostic=(checker exists). capabilities.bed_check
  продолжает означать live qualification, у E0=false. Config-invalid checker=false.
- stop_after_current:boolean в Executor.status из сохранённого meta.

RunState: queued/preparing/printing/cooling/removing/verifying/completed/failed/
cancelled/uncertain. Порядок и копии UI не изменяет. Имя файла и имя владельца
не предоставлены core: не выдумывать их. Номер повтора и число завершённых
в показанном плане можно вывести из queue, не выдавая это за полную историю.

POST control request остаётся совместимым: type-only для pause_queue,
resume_queue, stop_after_current,recheck_bed; pause_current_print/cancel_current_print
принимают type+run_id+action_id(UUID). В ответе сохранить Executor.status и добавить:
action_result:{type:ActionType,command_id:UUID|null,state:executed|rejected|uncertain,
result:{code?:stable short string}}.
Для physical вернуть фактический результат существующего command(local=True),
не менять физический код и durable dedup. Для простых действий executed только
после успешной записи. Recheck с proof=None =>rejected/bed_proof_unavailable;
валидный occupied/unknown =>executed (завершена проверка, не разрешена печать).
Не выдавать status-only/HTTP2xx за подтверждение действия. Нет action_result =>
UI показывает uncertain, не отправляет действие повторно автоматически.

POST pairing возвращает существующие {code,expires_at}; использовать время
ответа, не фиксированный TTL и не выдуманный QR/deep-link. Никаких credentials,
session-cookie или pairing code в localStorage/diagnostic export.

## 2. Shared pure domain и runtime

packages/printer-logic/src/autoprinter.ts — отдельный entrypoint
@treed/printer-logic/autoprinter, существующий index/exports сохранить.
Экспортировать AutoPrinterStatus, AutoPrinterQueueRun, AutoPrinterActionType,
AutoPrinterAction, AutoPrinterActionResult, AutoPrinterPairing;
parseAutoPrinterStatus/parseAutoPrinterActionResult/parseAutoPrinterPairing;
getAutoPrinterStartBlockReason и русские описания state/reason/action.
Парсеры берут unknown и выбрасывают безопасную ошибку при malformed/schema mismatch.
UUID, enum, числа, даты, identity/контекст и предел queue1000 проверяются.
Старый status без queue может быть read-only совместимым, но не порождать ложную
очередь/готовность. Нормализованные executionSnapshotAvailable и queueAvailable
явно отличают отсутствующие старые поля от idle/пустой очереди. Реальный
configured:false/disabled DTO не содержит execution snapshot/counts/capabilities
и должен приниматься без выдуманного ready/empty. Не переносить fetch/React/storage
в shared package.
Pure tests импортируют source. Новый subpath в package exports указывает dist;
существующая сборка включает src. Для разработки/адресных тестов добавить точный
workspace source alias в vite/vitest/tsconfig, чтобы не требовать запрещённый build.
Не устанавливать пакеты, не генерировать dist/release/archive и не менять версии
без надобности. Доставка артефакта treed-front остаётся отдельным этапом.

src/core/autoprinter/client.ts:
AutoPrinterClient {getStatus(signal?:AbortSignal),pair(),control(action)}.
getStatus Promise<AutoPrinterStatus>, pair Promise<AutoPrinterPairing>,
control Promise<AutoPrinterActionResult>. Существующий moonrakerUrl, fetch с
ограниченным ожиданием (status5s, action/pair до35s), без raw exception/body leakage.
404/405=>unsupported; прочие ошибки показывать. GET/control body unwrapped,
как wrap_result=False в core. Не менять provider/connection/fallback.

src/core/store/useAutoPrinter.ts экспортирует useAutoPrinter(moonrakerConnected:boolean)
и AutoPrinterController. Один экземпляр в App; клиент factory из #runtime.
Controller: status|null, availability(loading|available|unsupported|error),stale,
error:string|null,pending:{id,type}|null,lastAction:{id,type,state,message}|null,
pairing:AutoPrinterPairing|null,requestPairing(),control(type),refresh(),
manualStartBlockReason:string|null. Все callbacks возвращают Promise<void>.
Для physical строить action с текущим run_id и crypto.randomUUID action_id;
для прочих оставлять type-only. Подтверждать command_id/type физического ответа.
Один non-overlapping poll (около5s), cancellation/unmount, explicitrefresh;
не создавать таймеры в Settings/Panel. Stale после30s без свежего локального GET
или при disconnected/error. Устаревший snapshot можно показывать с отметкой,
действия запрещены. Pending сериализует действия; HTTP/timeouts =>uncertain,
без auto replay. Не менять status оптимистически; читать свежий status после
действия. Clock/expired pairing контролировать в том же состоянии.

src/runtime/live.ts factory createAutoPrinterClient возвращает real client;
mocks/runtime.ts экспортирует такую же factory, из отдельного mocks/autoprinter.ts.
Mock default disabled/unmanaged, explicit mock-only scenarios occupied/unknown/
offline/revoked. Никакого перехода live->mock на ошибке; fake empty в live не нужен.

## 3. UI и guards

Дизайн: DESIGN.md, Settings→AutoPrinter→Очередь/Связь. Никакого нового bottom tab,
router, dashboard redesign или браузерной проверки. Existing cloud/AI stays separate.
Новый src/autoprinter/AutoPrinterPanel.tsx + CSS + README; props controller и
moonrakerConnected, без fetch/effect polling. SettingsPage получает optional
autoprinter props, чтобы старые settings consumers не ломались; App передаёт
единственный controller. Данные queue/rendered limits, stage, bed checked_at,
candidate vs qualified empty, reasons/unknown/revoked/unsupported должны быть честными.
Touch48x56, existing tokens/useModalFocus, без hover-only controls/overflow CTA.
Queue pause/resume/stop-after-current отдельно от currentprint pause/cancel;
Текущая печать управляется существующим dashboard и его подтверждением отмены;
AP panel даёт переход «К печати», не дублирует физические кнопки. Client/domain
поддерживает действующий physical DTO, но новые queue controls его не вызывают.
Pairing код не восстанавливается как успешная привязка после reload.
Отключение cloud/перепривязка/ручное объявление empty не поддержаны core:
не добавлять фальшивые controls. Локальная пауза очереди поддержана и явно названа.

На обычные start/file/replay пути добавить дополнительный guard в
usePrinterCommands(runtimeContext, autoPrinterStartBlockReason?:string|null).
Проверять только start в реальной dispatch boundary, default null сохраняет API.
App передаёт controller.manualStartBlockReason; также показать причину у existing
start UI. Both normal file-start and repeat-completed идут через этот guard.
Managed=(enabled&&configured&&paired), независимо от execution_enabled/ready:
ручной start блокируется. Loading/schema error/stale также блокируют start,
пока нельзя доказать unmanaged; confirmed unsupported404/405 или свежий
disabled/unpaired status сохраняет обычную печать. Снятие существующей UI паузы
и новые remote-starts не реализовывать. Native pause/cancel и их guards/pending
не зависят от AutoPrinter poll/TreeD; новые guards не должны их блокировать.
Client guard дополняет core, не объявляется аппаратной изоляцией других клиентов.

## 4. Проверки и владение

Core worker: три autoprinter component/store/execution.py + их три tests +
docs/autoprinter.md; отдельная core lease .unlazy/autoprinter-ui-api/GATES.md.
Domain/runtime worker: packages/printer-logic новый entry/tests/package.json/README,
src/core/autoprinter/**,src/core/store/useAutoPrinter*,runtime/live,mocks/runtime,
mocks/autoprinter.ts,vite/vitest/tsconfig.app configs. Не меняет App/commands/UI.
UI worker: src/autoprinter/**,App.tsx+test,settings config/Page/Container,
commands/usePrinterCommands.ts+test,src/README.md,docs/autoprinter.md.
Workers не запускают проверки и не создают подагентов; tester делает только
выбранные адресные unit/integration tests после стабилизации, reviewer читает diff.
Проверки: malformed/stale/out-of-order response, unknown action/network outcome,
one poll/mock isolation, queue privacy, receipts/dedup, occupied/unknown, native
pause/cancel при offlineTreeD, forbidden manualstart, старый core. Без реального IO.
