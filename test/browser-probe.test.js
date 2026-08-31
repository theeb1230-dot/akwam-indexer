const test = require("node:test");
const assert = require("node:assert/strict");

class SilentWebSocket {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(name, callback) {
    this.listeners.set(name, callback);
  }

  send() {
    // Intentionally never responds: regression fixture for a stalled CDP command.
  }

  close() {}
}

test("CDP commands have a hard timeout", async () => {
  const original = global.WebSocket;
  global.WebSocket = SilentWebSocket;

  try {
    const { cdpClient } = require("../scripts/wecima-browser-probe");
    const client = cdpClient("ws://fixture.invalid");

    await assert.rejects(
      client.send("Runtime.evaluate", {}, 20),
      /CDP_COMMAND_TIMEOUT: Runtime\.evaluate/
    );
  } finally {
    global.WebSocket = original;
  }
});
