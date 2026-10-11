# Gates: Симуляция калибровок

OWNS: mocks/runtime.ts, tests/calibrationMockRuntime.test.ts, src/core/transport/types.ts, src/core/transport/moonrakerClient.ts, src/core/transport/moonrakerClient.test.ts, src/core/store/usePrinterSnapshot.ts, src/core/store/usePrinterSnapshot.test.tsx, src/core/store/usePrinterSnapshot.fileRace.test.tsx, src/App.tsx, src/macros/MacrosContainer.tsx, src/app/AppScreenContent.tsx, src/app/AppScreenContent.test.tsx, src/macros/PidCalibrationScreen.tsx, src/macros/PidCalibrationScreen.test.tsx

Scope: реалистичные mock workflow и read-only получение спектров X/Y через существующий transport, hook и composition. Core-часть принимается в printer-core/.unlazy/resonance-readout/GATES.md.

- [x] G1: Основной агент проверил четыре винта, переходы ADXL, шейпера, экструдера и Eddy, обновление спектров после каждого успешного теста в симуляции; данные помечены симуляцией и не выданы за аппаратную проверку.
  EVIDENCE: Mock9/9, transport/store44/44, PID23/23, AppScreenContent1/1. Root фактически просмотрел Симуляция, четыре винта, fresh X/Y, ручное измерение экструдера, Eddy TESTZ и первый слой. В итоговом E2E26/27 прошли; оставшийся screws→mesh→save→firstLayer прошёл адресно после исправления слишком короткого 5s ожидания на 15s (mock restart4s + snapshot polling2s).
- [x] G2: Read-only export читает фиксированные full/light X/Y; методы live и mock совместимы, передаются через существующий client без второго экземпляра; pending/restart guards и правила live не ослаблены.
  EVIDENCE: Root и reviewer проверили единственный существующий transport/hook/composition, revision baseline, abort/unmount tokens и full-screen latch до явного завершения. Core Linux API tests10/10, loader8 JSON fixtures и bash-n прошли; core gates2/2 приняты отдельно. Auth, движение и реальные команды не ослаблены; deploy и аппаратная проверка не выполнялись.
