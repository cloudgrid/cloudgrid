import { connect, headers, JSONCodec, type NatsConnection } from "nats";
import type { BridgeMessage, EphemeralPubSub, RequestReplyClient } from "../../bridge";

interface NATSConnectionOptions {
  servers: string;
  name: string;
}

export async function connectNATS(options: NATSConnectionOptions): Promise<NatsConnection> {
  return connect(options);
}

export class NATSRequestReplyClient implements RequestReplyClient {
  #connection: NatsConnection;
  #codec = JSONCodec<unknown>();

  constructor(connection: NatsConnection) {
    this.#connection = connection;
  }

  async request(
    subject: string,
    payload: Uint8Array,
    options: { timeoutMs: number; headers?: Record<string, string> },
  ): Promise<Uint8Array> {
    const requestPayload = this.#codec.decode(payload);
    const messageHeaders = headers();
    for (const [key, value] of Object.entries(options.headers ?? {})) {
      messageHeaders.set(key, value);
    }
    const message = await this.#connection.request(subject, this.#codec.encode(requestPayload), {
      timeout: options.timeoutMs,
      headers: messageHeaders,
    });
    const responsePayload = this.#codec.decode(message.data);
    return this.#codec.encode(responsePayload);
  }
}

export class NATSEphemeralPubSub implements EphemeralPubSub {
  #connection: NatsConnection;
  #codec = JSONCodec<unknown>();

  constructor(connection: NatsConnection) {
    this.#connection = connection;
  }

  async subscribe(
    subject: string,
    onMessage: (message: BridgeMessage) => void | Promise<void>,
  ): Promise<AsyncDisposable> {
    const subscription = this.#connection.subscribe(subject);
    let active = true;
    void (async () => {
      try {
        for await (const message of subscription) {
          await onMessage({
            subject: message.subject || subject,
            data: this.#codec.encode(this.#codec.decode(message.data)),
          });
        }
      } catch {
        if (active) {
          subscription.unsubscribe();
        }
      }
    })();
    return {
      async [Symbol.asyncDispose]() {
        active = false;
        subscription.unsubscribe();
      },
    };
  }

  async publish(subject: string, payload: Uint8Array): Promise<void> {
    const message = this.#codec.decode(payload);
    this.#connection.publish(subject, this.#codec.encode(message));
  }
}

export class NATSBridgeLifecycle {
  #connection: NatsConnection;
  #flushTimeoutMs: number;

  constructor(connection: NatsConnection, options: { flushTimeoutMs?: number } = {}) {
    this.#connection = connection;
    this.#flushTimeoutMs = options.flushTimeoutMs ?? 1000;
  }

  async health(): Promise<"ok" | "unavailable"> {
    if (this.#connection.isClosed() || this.#connection.isDraining()) {
      return "unavailable";
    }
    try {
      await withTimeout(this.#connection.flush(), this.#flushTimeoutMs);
      return "ok";
    } catch {
      return "unavailable";
    }
  }

  async close(): Promise<void> {
    await this.#connection.drain();
  }
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error("NATS readiness flush timed out")), timeoutMs);
  });
  return Promise.race([operation, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}
