import { describe, expect, it } from 'vitest'
import { normalizeMoonrakerSystemStatus, summarizeMoonrakerSystemStatus } from './systemStatus'

function buildHealthyInput() {
  return {
    systemInfo: {
      system_info: {
        cpu_info: {
          cpu_count: 4,
          processor: 'aarch64',
          cpu_desc: 'Rockchip RK3399',
          model: 'ROCK Pi 4B+',
          total_memory: 4_096_000,
        },
        distribution: {
          pretty_name: 'Armbian 24 Debian 12',
        },
        sd_info: {
          manufacturer: 'Samsung',
          product_name: 'eMMC',
          capacity: 64 * 1024 ** 3,
        },
        canbus: {
          can0: {
            bitrate: 1_000_000,
            tx_queue_len: 1024,
            driver: 'gs_usb',
          },
        },
        network: {
          eth0: {
            ip_addresses: [
              { family: 'ipv4', address: '192.168.0.197' },
            ],
          },
        },
        available_services: ['klipper', 'moonraker'],
        service_state: {
          klipper: { active_state: 'active', sub_state: 'running' },
          moonraker: { active_state: 'active', sub_state: 'running' },
        },
      },
    },
    processStats: {
      system_cpu_usage: { cpu: 12.5 },
      system_memory: { total: 4_096_000, used: 1_024_000, available: 3_072_000 },
      cpu_temp: 51.2,
      system_uptime: 86_400,
      network: {
        eth0: { rx_bandwidth: 1024, tx_bandwidth: 2048 },
      },
      throttled: { bits: 0, flags: [] },
    },
    serverInfo: {
      klippy_state: 'ready',
      moonraker_version: 'v0.9.3',
      api_version_string: '1.5.0',
      failed_components: [],
      warnings: [],
    },
    printerInfo: {
      hostname: 'printer-v2',
      software_version: 'v0.13.0-641',
      state: 'ready',
      state_message: 'Printer is ready',
    },
    objectStatus: {
      status: {
        mcu: {
          mcu_version: 'v0.13.0-641',
          mcu_build_versions: 'gcc: (15:12.2.rel1-1) 12.2.1',
          mcu_constants: { MCU: 'stm32f446xx', CLOCK_FREQ: 180_000_000 },
          last_stats: { mcu_awake: 0.01, mcu_task_avg: 0.00002, retransmit_seq: 0, bytes_invalid: 0 },
        },
        'mcu EBBCan': {
          mcu_version: 'v0.13.0-641',
          mcu_constants: { MCU: 'stm32g0b1xx', CLOCK_FREQ: 64_000_000 },
          last_stats: { mcu_awake: 0.02, retransmit_seq: 0, bytes_invalid: 0 },
        },
        'canbus_stats EBBCan': {
          bus_state: 'active',
          rx_error: 0,
          tx_error: 0,
          tx_retries: 0,
        },
      },
    },
    errors: [] as string[],
    updatedAt: '2026-07-02T12:00:00.000Z',
  }
}

describe('normalizeMoonrakerSystemStatus', () => {
  it('normalizes host, software, MCU, CAN, network and service state', () => {
    const status = normalizeMoonrakerSystemStatus(buildHealthyInput())

    expect(status).toMatchObject({
      loadState: 'ready',
      health: 'ok',
      updatedAt: '2026-07-02T12:00:00.000Z',
      host: {
        hostname: 'printer-v2',
        model: 'ROCK Pi 4B+',
        cpuUsagePercent: 12.5,
        cpuTemperatureC: 51.2,
        uptimeSec: 86_400,
      },
      software: {
        klipperVersion: 'v0.13.0-641',
        moonrakerVersion: 'v0.9.3',
        moonrakerApiVersion: '1.5.0',
        klippyState: 'ready',
      },
    })
    expect(status.mcus.map((mcu) => mcu.objectName)).toEqual(['mcu', 'mcu EBBCan'])
    expect(status.canDevices[0]).toMatchObject({ label: 'EBBCan', busState: 'active' })
    expect(status.canInterfaces[0]).toMatchObject({ name: 'can0', bitrate: 1_000_000 })
    expect(status.networks[0]).toMatchObject({ name: 'eth0', ipv4: '192.168.0.197' })
    expect(status.services.every((service) => service.healthy)).toBe(true)
  })

  it('marks partial data and CAN/service problems as warnings', () => {
    const input = buildHealthyInput()
    input.errors = ['Процессы: HTTP 503']
    input.systemInfo.system_info.service_state.moonraker = {
      active_state: 'failed',
      sub_state: 'failed',
    }
    input.objectStatus.status['canbus_stats EBBCan'] = {
      bus_state: 'warn',
      rx_error: 2,
      tx_error: 0,
      tx_retries: 3,
    }

    const status = normalizeMoonrakerSystemStatus(input)

    expect(status.loadState).toBe('partial')
    expect(status.health).toBe('warning')
  })

  it('marks Klipper shutdown as a hard failure', () => {
    const input = buildHealthyInput()
    input.serverInfo.klippy_state = 'shutdown'

    const status = normalizeMoonrakerSystemStatus(input)

    expect(status.health).toBe('error')
  })

  it('does not turn an inactive KlipperScreen fallback service into a warning', () => {
    const input = buildHealthyInput()
    input.systemInfo.system_info.available_services.push('KlipperScreen')
    const serviceState = input.systemInfo.system_info.service_state as Record<
      string,
      { active_state: string; sub_state: string }
    >
    serviceState.KlipperScreen = {
      active_state: 'inactive',
      sub_state: 'dead',
    }

    const status = normalizeMoonrakerSystemStatus(input)

    expect(status.health).toBe('ok')
    expect(status.services.find((service) => service.name === 'KlipperScreen')).toMatchObject({
      activeState: 'inactive',
      subState: 'dead',
      healthy: false,
    })
  })

  it('returns unavailable when no endpoint provides usable data', () => {
    const status = normalizeMoonrakerSystemStatus({
      errors: ['Система: таймаут', 'Moonraker: таймаут'],
    })

    expect(status.loadState).toBe('unavailable')
    expect(status.health).toBe('error')
    expect(status.updatedAt).toBeNull()
  })
})

describe('summarizeMoonrakerSystemStatus', () => {
  it('returns a compact healthy runtime status', () => {
    const summary = summarizeMoonrakerSystemStatus(normalizeMoonrakerSystemStatus(buildHealthyInput()))

    expect(summary).toEqual({
      label: 'В норме',
      tone: 'ok',
      notice: 'Доступные runtime-данные без предупреждений.',
    })
  })

  it('uses a concrete unhealthy service as the warning notice', () => {
    const input = buildHealthyInput()
    input.systemInfo.system_info.service_state.moonraker = {
      active_state: 'failed',
      sub_state: 'failed',
    }

    const summary = summarizeMoonrakerSystemStatus(normalizeMoonrakerSystemStatus(input))

    expect(summary).toEqual({
      label: 'Внимание',
      tone: 'warning',
      notice: 'Сервис moonraker: failed / failed.',
    })
  })

  it('keeps the endpoint error when diagnostics are unavailable', () => {
    const summary = summarizeMoonrakerSystemStatus(normalizeMoonrakerSystemStatus({
      errors: ['Система: таймаут'],
    }))

    expect(summary).toEqual({
      label: 'Нет данных',
      tone: 'error',
      notice: 'Система: таймаут',
    })
  })
})
