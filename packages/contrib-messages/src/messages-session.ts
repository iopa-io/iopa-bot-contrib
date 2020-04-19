import {
  IMessageStore,
  ISimpleDatabase,
  ISessionDatabase,
  App,
  BotReadingLegacy,
  IConsumerProfile,
  IopaBotReading,
  IopaBotReadingBase
} from 'iopa-types'
import { IopaMap } from 'iopa'
import MessageStoreMemory from './messages-memory'

export interface Dependencies {
  'urn:io.iopa.bot:messages': IMessageStore
  'urn:io.iopa.database': ISimpleDatabase
  'urn:io.iopa.database:session': ISessionDatabase
  'urn:consumer:profile': IConsumerProfile
}

export default class MessageStoreSession extends MessageStoreMemory
  implements IMessageStore {
  ['iopa.Version'] = '3.0'

  app: App<Dependencies>

  isReady: Promise<void>

  constructor(app: App<Dependencies>) {
    super()
    this.app = app
    app.setCapability('urn:io.iopa.bot:messages', this)
    this.isReady = this.init()
  }

  async init() {
    await this.app.capability('urn:consumer:profile').isReady

    const keys = await this.app
      .capability('urn:io.iopa.database:session')
      .getKeys()

    await Promise.all(
      keys
        .filter(key => key.startsWith('message_'))
        .map(key => parseInt(key.replace(/^message_/, '')))
        .sort((a, b) => a - b)
        .map(async key => {
          const item = await this.app
            .capability('urn:io.iopa.database:session')
            .get(`message_${key}`)
          this.items.push(new IopaMap<IopaBotReadingBase>(item) as any)
          this.seq = item.key + 1
        })
    )

    const utterances = await this.app
      .capability('urn:io.iopa.database:session')
      .get('message-utterances')

    if (utterances && Object.keys(utterances).length > 0) {
      this._utterances = utterances
    }

    this.emit('state', this)
  }

  public get utterances() {
    return this._utterances
  }

  public set utterances(utterances: string[]) {
    this.app
      .capability('urn:io.iopa.database:session')
      .put(`message-utterances`, utterances)
    this._utterances = utterances
    this.emit('utterances', utterances)
  }

  closeCard = async (key?: number) => {
    if (this.items.length === 0) {
      return
    }
    const item =
      !key || key === 0
        ? this.items.find(finditem => finditem.key === key)
        : this.items[this.items.length - 1]

    if (item) {
      item.get('bot.MetaData').isClosed = true
      await this.app
        .capability('urn:io.iopa.database:session')
        .put(`message_${item.key}`, item)
    }

    this.emit('state', this)
  }

  async removeCard(key: number) {
    const itemIndex = this.items.findIndex(item => item.key === key)
    await this.app
      .capability('urn:io.iopa.database:session')
      .delete(`message_${itemIndex}`)
    super.removeCard(key)
  }

  protected async store_(item: BotReadingLegacy): Promise<IopaBotReading> {
    item.key = item.key || this.seq++
    // item = JSON.parse(JSON.stringify(item));
    const iopaItem = MessageStoreMemory.convertFromLegacy(item)
    iopaItem.get('bot.MetaData').isClosed = false

    await this.app
      .capability('urn:io.iopa.database:session')
      .put(`message_${iopaItem.key}`, iopaItem.toJSON())

    this.items.push(iopaItem)
    this.emit('state', this)
    this.emit('store', iopaItem)
    return iopaItem
  }

  public async clear() {
    this.items.splice(0)
    this.seq = 1
    this.emit('state', this)
    await this.app.capability('urn:io.iopa.database:session').clear()
    await this.app.capability('urn:consumer:profile').save()
  }
}
