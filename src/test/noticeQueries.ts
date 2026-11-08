import { buildQueries, queryAllByAttribute } from '@testing-library/react'

type Notice = 'error' | 'status' | 'log'
type Options = { name?: string | RegExp }

const queryAll = (container: HTMLElement, notice: Notice, { name }: Options = {}) =>
  queryAllByAttribute('data-notice', container, notice).filter((element) => {
    if (name === undefined) return true
    const label = element.getAttribute('aria-label') ?? element.textContent ?? ''
    return typeof name === 'string' ? label === name : name.test(label)
  })

const [queryByNotice, getAllByNotice, getByNotice, , findByNotice] = buildQueries<[Notice, Options?]>(
  queryAll,
  (_, notice) => `Найдено несколько сообщений ${notice}`,
  (_, notice) => `Сообщение ${notice} не найдено`,
)

export const noticeScreen = {
  queryByNotice: (notice: Notice, options?: Options) => queryByNotice(document.body, notice, options),
  getByNotice: (notice: Notice, options?: Options) => getByNotice(document.body, notice, options),
  getAllByNotice: (notice: Notice, options?: Options) => getAllByNotice(document.body, notice, options),
  findByNotice: (notice: Notice, options?: Options) => findByNotice(document.body, notice, options),
}
