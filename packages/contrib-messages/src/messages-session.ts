import {
  IMessageStore,
  ISimpleDatabase,
  ISessionDatabase,
  AppWithCapabilities,
  BotReading,
  BotReadingLegacy,
  IConsumerProfile
} from "iopa-types";
import { MessageStoreMemory } from ".//messages-memory";

export interface Dependencies {
  "urn:io.iopa.bot:messages": IMessageStore;
  "urn:io.iopa.database": ISimpleDatabase;
  "urn:io.iopa.database:session": ISessionDatabase;
  "urn:consumer:profile": IConsumerProfile;
}

export class MessageStoreSession extends MessageStoreMemory
  implements IMessageStore {
  "iopa.Version": string = "3.0";

  app: AppWithCapabilities<Dependencies>;

  isReady: Promise<void>;

  constructor(app: AppWithCapabilities<Dependencies>) {
    super();
    this.app = app;
    app.capabilities["urn:io.iopa.bot:messages"] = this;
    this.isReady = this.init();
  }

  async init() {
    await this.app.capabilities["urn:consumer:profile"].isReady;

    const keys = await this.app.capabilities[
      "urn:io.iopa.database:session"
    ].getKeys();

    await Promise.all(
      keys
        .filter(key => key.startsWith("message_"))
        .map(key => parseInt(key.replace(/^message_/, "")))
        .sort((a, b) => a - b)
        .map(async key => {
          const item = await this.app.capabilities[
            "urn:io.iopa.database:session"
          ].get(`message_${key}`);
          this.items.push(item);
          this.seq = item.key + 1;
        })
    );

    const utterances = await this.app.capabilities[
      "urn:io.iopa.database:session"
    ].get("message-utterances");

    if (utterances) {
      this._utterances = utterances;
    }

    this.emit("state", this);
  }

  public get utterances() {
    return this._utterances;
  }

  public set utterances(utterances: string[]) {
    this.app.capabilities["urn:io.iopa.database:session"].put(
      `message-utterances`,
      utterances
    );
    this._utterances = utterances;
    this.emit("utterances", utterances);
  }

  closeCard = async (key?: number) => {
    if (this.items.length == 0) {
      return;
    }
    const item =
      !key || key == 0
        ? this.items.find(item => item.key === key)
        : this.items[this.items.length - 1];

    if (item) {
      item.bot_MetaData.isClosed = true;
      await this.app.capabilities["urn:io.iopa.database:session"].put(
        `message_${item.key}`,
        item
      );
    }

    this.emit("state", this);
  };

  removeCard = async (key: number) => {
    const itemIndex = this.items.findIndex(item => item.key === key);
    await this.app.capabilities["urn:io.iopa.database:session"].delete(
      `message_${itemIndex}`
    );
    super.removeCard(key);
  };

  protected async store_(item: BotReadingLegacy) {
    item.key = item.key || this.seq++;
    item = JSON.parse(JSON.stringify(item));
    MessageStoreMemory.convertFromLegacy(item);

    item.bot_MetaData.isClosed = false;
    await this.app.capabilities["urn:io.iopa.database:session"].put(
      `message_${item.key}`,
      item
    );

    this.items.push(item);
    this.emit("state", this);
    this.emit("store", item);
    return item;
  }

  public async clear() {
    await this.app.capabilities["urn:io.iopa.database:session"].clear();
    await this.app.capabilities["urn:consumer:profile"].save();

    this.items.splice(0);
    this.seq = 1;
    this.emit("state", this);
    return Promise.resolve();
  }
}
