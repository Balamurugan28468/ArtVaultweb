import { expect, it } from 'vitest'

it('blocks unmocked HTTP requests before they can contact any backend', async () => {
  await expect(fetch('https://fixture.invalid/rest/v1/orders')).rejects.toThrow('network access is disabled')
})

it('blocks unmocked realtime connections before a socket opens', () => {
  expect(() => new WebSocket('wss://fixture.invalid/realtime/v1')).toThrow('network access is disabled')
})
