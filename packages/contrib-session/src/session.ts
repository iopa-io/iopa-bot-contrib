/* eslint-disable class-methods-use-this */
import { App, ISessionDatabase } from 'iopa-types'

export default class SessionMiddleware implements ISessionDatabase {
  'iopa.Version': string = '3.0'

  isReady: Promise<void>

  constructor(app: App<any, any>) {
    if (app.capability('urn:io.iopa.database:session')) {
      throw new Error('Session Database already registered for this app')
    }

    app.setCapability('urn:io.iopa.database:session', this)

    app.setCapability(
      'urn:io.iopa.database',
      app.capability('urn:io.iopa.database') ||
        app.capability('urn:io.iopa.database:session')
    )
    this.isReady = Promise.resolve(null)
  }

  async get<T>(key: string): Promise<T> {
    key = key.replace(/^sessions\//, '')
    return JSON.parse(sessionStorage.getItem(key) || '{}')
  }

  async delete(key: string) {
    key = key.replace(/^sessions\//, '')
    sessionStorage.removeItem(key)
  }

  async put<T extends { updated: number }>(key: string, blob: T) {
    key = key.replace(/^sessions\//, '')
    if (blob) {
      blob.updated = Math.floor(new Date().getTime() / 1000)
    }
    sessionStorage.setItem(key, JSON.stringify(blob))
  }

  async getKeys() {
    return Object.keys(sessionStorage)
  }

  async clear() {
    sessionStorage.clear()
  }
}
