import {
  IMessageStore,
  IopaBotReading,
  IopaBotReadingLegacy,
  BotReadingLegacy
} from 'iopa-types'
import { IopaMap } from 'iopa'

export default class MessageStoreMemory implements IMessageStore {
  ['iopa.Version'] = '3.0'

  public items: IopaBotReading[]

  protected _utterances: string[] = ['']

  protected events: { [key: string]: any[] }

  protected seq = 1

  isReady: Promise<void>

  public constructor() {
    this.events = {}
    this.items = []
    this.seq = 1
    this.isReady = Promise.resolve(null)
    this.emit('state', this)
  }

  public get utterances() {
    return this._utterances
  }

  public set utterances(utterances: string[]) {
    this._utterances = utterances
    this.emit('utterances', utterances)
  }

  public closeCard = async (key?: number) => {
    if (this.items.length === 0) {
      return
    }
    const item: IopaBotReading =
      !key || key === 0
        ? this.items.find(itemfind => itemfind.key === key)
        : this.items[this.items.length - 1]

    if (item) {
      item.get('bot.MetaData').isClosed = true
    }
    this.emit('state', this)
  }

  public async removeCard(key: number) {
    const itemIndex = this.items.findIndex(item => item.key === key)
    this.items.splice(itemIndex, 1)
    this.emit('state', this)
  }

  public push = async (item: BotReadingLegacy) => {
    item.key = this.seq++
    const iopaItem = await this.store_(item)

    if (
      !iopaItem.get('bot.From').id ||
      !iopaItem.get('bot.From').id.startsWith('ai:')
    ) {
      /** emit regular consumer participant text, legacy format */
      this.emit('push', MessageStoreMemory.convertToLegacy(iopaItem))
    }
  }

  public typingIndicatorOn = () => {
    this.emit('typingIndicatorOn')
  }

  public typingIndicatorOff = () => {
    this.emit('typingIndicatorOff')
  }

  protected async store_(item: BotReadingLegacy): Promise<IopaBotReading> {
    item.key = item.key || this.seq++
    // item = JSON.parse(JSON.stringify(item));
    const iopaItem = MessageStoreMemory.convertFromLegacy(item)
    iopaItem.get('bot.MetaData').isClosed = false
    this.items.push(iopaItem)
    this.emit('state', this)
    this.emit('store', iopaItem)
    return iopaItem
  }

  public clear() {
    this.items.splice(0)
    this.seq = 1
    this.emit('state', this)
    return Promise.resolve()
  }

  public addListener<T>(event: string, listener: (_?: T) => void) {
    this.events[event] = this.events[event] || []
    this.events[event].push(listener)
  }

  public removeListener(event: string, listener: (_?: any) => void) {
    let idx

    if (typeof this.events[event] === 'object') {
      idx = this.events[event].indexOf(listener)

      if (idx > -1) {
        this.events[event].splice(idx, 1)
      }
    }
  }

  public emit<T>(event: string, payload?: T) {
    let i
    let listeners
    let length

    if (typeof this.events[event] === 'object') {
      listeners = this.events[event].slice()
      length = listeners.length

      for (i = 0; i < length; i++) {
        listeners[i](payload)
      }
    }
  }

  static convertFromLegacy(base: BotReadingLegacy): IopaBotReading {
    const item = new IopaMap<BotReadingLegacy>(base) as IopaBotReadingLegacy

    item.set(
      'bot.Text',
      item.get('bot.Text') || item.get('urn:consumer:message:text')
    )
    item.delete('urn:consumer:message:text')

    item.set(
      'bot.Source',
      item.get('bot.Source') || item.get('urn:server:source')
    )
    item.delete('urn:server:source')

    item.set(
      'bot.From',
      item.get('bot.From') || { id: item.get('urn:consumer:id') }
    )
    item.delete('urn:consumer:id')

    item.set(
      'bot.MetaData',
      item.get('bot.MetaData') || item.get('urn:consumer:metadata') || {}
    )
    item.delete('urn:consumer:metadata')

    item.set(
      'timestamp',
      item.get('timestamp') || item.get('urn:server:timestamp')
    )
    item.delete('urn:server:timestamp')

    if (item.get('card')) {
      let { type, ...content } = item.get('card')

      if (content.body && content.body.body) {
        content = content.body
      }

      if (
        type === 'ReactiveCard' ||
        type === 'AdaptiveCard' ||
        type === 'adaptive-card' ||
        type === 'reactive-card'
      ) {
        type = 'application/vnd.microsoft.card.adaptive'
      }

      item.set(
        'bot.Attachment',
        item.get('bot.Attachment') || {
          contentType: type,
          content
        }
      )

      item.delete('card')
    }

    return item
  }

  static convertToLegacy(iopaItem: IopaBotReading): BotReadingLegacy {
    const item = new IopaMap(iopaItem.toJSON()) as IopaBotReadingLegacy

    item.set(
      'urn:consumer:message:text',
      item.get('urn:consumer:message:text') || item.get('bot.Text')
    )
    item.delete('bot.Text')

    item.set(
      'urn:server:source',
      item.get('urn:server:source') || item.get('bot.Source')
    )
    item.delete('bot.Source')

    item.set(
      'urn:consumer:id',
      item.get('urn:consumer:id') || item.get('bot.From').id
    )
    item.delete('bot.From')

    item.set(
      'urn:consumer:metadata',
      item.get('urn:consumer:metadata') || item.get('bot.MetaData') || {}
    )
    item.delete('bot.MetaData')

    item.set(
      'urn:server:timestamp',
      item.get('urn:server:timestamp') || item.get('timestamp')
    )
    item.delete('timestamp')

    item.set(
      'card',
      item.get('card') || item.get('bot.Attachment')
        ? {
            type: item.get('bot.Attachment').contentType,
            ...item.get('bot.Attachment').content
          }
        : undefined
    )
    item.delete('bot.Attachment')

    if (
      item.get('card') &&
      item.get('card').type === 'application/vnd.microsoft.card.adaptive'
    ) {
      item.get('card').type = 'AdaptiveCard'
    }

    return item.toJSON()
  }
}
