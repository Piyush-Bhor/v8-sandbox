import fs from 'fs';
import path from 'path';

const NativeSandbox = require('bindings')('sandbox').Sandbox;

const RUNTIME = fs.readFileSync(path.join(__dirname, 'runtime.js')).toString();

export interface WorkerMessage {
  type: 'initialize' | 'execute' | 'callback' | 'cancel' | 'exit';
  template: string;
  code: string;
  globals: string;
  callbackId: string;
  args: string;
}

export default class Worker {
  native: any;

  connected: boolean = false;

  constructor() {
    this.native = new NativeSandbox(process.argv[2]);
  }

  initialize({ template }: WorkerMessage) {
    this.reset(true);
    this.connect();

    this._execute(RUNTIME);
    this._execute(template);
  }

  execute({ code, globals }: WorkerMessage) {
    this.reset(false);
    this.connect();

    if (globals !== '{}') {
      this._execute(`Object.assign(global, ${globals});`);
    }

    this._execute(code);
  }

  _execute(code) {
    return this.native.execute(code);
  }

  reset(force) {
    if (force || !this.native.initialized) {
      this.native.initialize();
      this.native.initialized = true;
    }
  }

  connect() {
    if (this.connected) {
      return;
    }

    this.native.connect();
    this.connected = true;
  }

  disconnect() {
    if (!this.connected) {
      return;
    }

    this.native.disconnect();
    this.connected = false;
  }

  finish() {
    this.native.finish();
  }

  cancel({ callbackId }: WorkerMessage) {
    this.native.cancel(callbackId);
  }

  callback({ callbackId, args }: WorkerMessage) {
    this.native.callback(callbackId, JSON.stringify(args));
  }

  exit(message: WorkerMessage) {
    this.disconnect();
    process.off('message', this.handleMessage);
  }

  handleMessage = (message: WorkerMessage) => {
    switch (message.type) {
      case 'initialize':
        this.initialize(message);
        break;
      case 'execute':
        this.execute(message);
        break;
      case 'callback':
        this.callback(message);
        break;
      case 'cancel':
        this.cancel(message);
        break;
      case 'exit':
        this.exit(message);
        break;
      default:
        throw new Error('invalid message');
    }

    this.unref();
  };

  beforeExit = (code) => {
    this.finish();
    this.ref();
  };

  ref = () => {
    (process as any).channel.ref();
  };

  unref = () => {
    (process as any).channel.unref();
  };
}

const worker = new Worker();

process.on('beforeExit', worker.beforeExit);
process.on('message', worker.handleMessage);
