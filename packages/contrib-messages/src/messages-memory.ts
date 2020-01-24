import { IMessageStore, BotReading, BotReadingLegacy } from "iopa-types";

export class MessageStoreMemory implements IMessageStore {
  public items: BotReading[];
  protected _utterances: string[] = [""];
  protected events: { [key: string]: any[] };
  protected seq: number = 1;
  isReady: Promise<void>;

  public constructor() {
    this.events = {};
    this.items = [];
    this.seq = 1;
    this.isReady = Promise.resolve(null);
    this.emit("state", this);
  }

  public get utterances() {
    return this._utterances;
  }

  public set utterances(utterances: string[]) {
    this._utterances = utterances;
    this.emit("utterances", utterances);
  }

  public closeCard = async (key?: number) => {
    if (this.items.length == 0) {
      return;
    }
    const item: BotReading =
      !key || key == 0
        ? this.items.find(item => item.key === key)
        : this.items[this.items.length - 1];

    if (item) {
      item.bot_MetaData.isClosed = true;
    }
    this.emit("state", this);
  };

  public async removeCard(key: number) {
    const itemIndex = this.items.findIndex(item => item.key === key);
    this.items.splice(itemIndex, 1);
    this.emit("state", this);
  }

  public push = async (item: BotReadingLegacy) => {
    item.key = this.seq++;
    item = await this.store_(item);

    if (!item.bot_From.id || !item.bot_From.id.startsWith("ai:")) {
      // regular consumer participant text
      this.emit(
        "push",
        MessageStoreMemory.convertToLegacy(JSON.parse(JSON.stringify(item)))
      );
    }
  };

  public typingIndicatorOn = () => {
    this.emit("typingIndicatorOn");
  };

  public typingIndicatorOff = () => {
    this.emit("typingIndicatorOff");
  };

  protected async store_(item: BotReadingLegacy) {
    item.key = item.key || this.seq++;
    item = JSON.parse(JSON.stringify(item));
    MessageStoreMemory.convertFromLegacy(item);
    item.bot_MetaData.isClosed = false;

    this.items.push(item);
    this.emit("state", this);
    this.emit("store", item);
    return item;
  }

  public clear() {
    this.items.splice(0);
    this.seq = 1;
    this.emit("state", this);
    return Promise.resolve();
  }

  public addListener = (event: string, listener: (_: any) => void) => {
    this.events[event] = this.events[event] || [];
    this.events[event].push(listener);
  };

  public removeListener = (event, listener) => {
    var idx;

    if (typeof this.events[event] === "object") {
      idx = this.events[event].indexOf(listener);

      if (idx > -1) {
        this.events[event].splice(idx, 1);
      }
    }
  };

  public emit = (event, ...args) => {
    var i, listeners, length;

    if (typeof this.events[event] === "object") {
      listeners = this.events[event].slice();
      length = listeners.length;

      for (i = 0; i < length; i++) {
        listeners[i].apply(this, args);
      }
    }
  };

  static convertFromLegacy(item: BotReadingLegacy) {
    item.bot_Text = item.bot_Text || item["urn:consumer:message:text"];
    delete item["urn:consumer:message:text"];

    item.bot_From = item.bot_From || { id: item["urn:consumer:id"] };
    delete item["urn:consumer:id"];

    if (item.bot_From.id == "ai:karla") {
      item.bot_From.id = "ai:iopa:io";
    }

    item.bot_Source = item.bot_Source || item["urn:server:source"];
    delete item["urn:server:source"];

    item.bot_MetaData =
      item.bot_MetaData || item["urn:consumer:metadata"] || {};
    delete item["urn:consumer:metadata"];

    item.timestamp = item.timestamp || item["urn:server:timestmap"];
    delete item["urn:server:timestamp"];

    if (item.card) {
      let { type, ...content } = item.card;

      if (content.body && content.body.body) {
        content = content.body;
      }

      if (
        type == "ReactiveCard" ||
        type == "AdaptiveCard" ||
        type == "adaptive-card" ||
        type == "reactive-card"
      ) {
        type = "application/vnd.microsoft.card.adaptive";
      }

      item.bot_Attachment = item.bot_Attachment || {
        contentType: type,
        content
      };
      delete item.card;
    }
  }

  static convertToLegacy(item: BotReadingLegacy) {
    item["urn:consumer:message:text"] =
      item["urn:consumer:message:text"] || item.bot_Text;
    delete item.bot_Text;

    item["urn:consumer:id"] = item["urn:consumer:id"] || item.bot_From.id;
    delete item.bot_From;

    if (item["urn:consumer:id"] == "ai:iopa:io") {
      item["urn:consumer:id"] = "ai:karla";
    }

    item["urn:server:source"] = item["urn:server:source"] || item.bot_Source;
    delete item.bot_Source;

    item["urn:consumer:metadata"] =
      item["urn:consumer:metadata"] || (item.bot_MetaData as any) || {};
    delete item.bot_MetaData;

    item["urn:server:timestmap"] =
      item["urn:server:timestmap"] || item.timestamp;
    delete item.timestamp;

    item.card =
      item.card || item.bot_Attachment
        ? {
            type: item.bot_Attachment.contentType,
            ...item.bot_Attachment.content
          }
        : undefined;
    delete item.bot_Attachment;

    if (
      item.card &&
      item.card.type == "application/vnd.microsoft.card.adaptive"
    ) {
      item.card.type = "AdaptiveCard";
    }

    return item;
  }
}
