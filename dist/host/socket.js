"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lodash_1 = require("lodash");
function tryParseJSON(value) {
    try {
        return JSON.parse(value);
    }
    catch (ex) {
        return null;
    }
}
class Socket {
    constructor(socket, sandbox) {
        this.handleData = (data) => {
            if (!this.message) {
                this.message = {
                    messageId: data.readInt32BE(0),
                    callbackId: data.readInt32BE(4),
                    length: data.readInt32BE(8),
                    data: data.subarray(12),
                };
            }
            else {
                this.message.data = Buffer.concat([this.message.data, data]);
            }
            if (this.message.data.length === this.message.length) {
                const { messageId, callbackId, data } = this.message;
                const json = data.toString('utf8');
                this.message = null;
                const invocation = tryParseJSON(json);
                const callback = callbackId > 0 ? (0, lodash_1.once)(((...args) => {
                    if (this.isConnected) {
                        this.sandbox.callback(messageId, callbackId, args);
                    }
                })) : null;
                const cancel = callbackId > 0 ? (0, lodash_1.once)((() => {
                    if (this.isConnected) {
                        this.sandbox.cancel(messageId, callbackId);
                    }
                })) : null;
                const write = (0, lodash_1.once)((result) => {
                    const string = JSON.stringify({ result: result ?? { value: undefined } });
                    const length = Buffer.byteLength(string, 'utf8');
                    const buffer = Buffer.alloc(length + 4);
                    buffer.writeInt32BE(length);
                    buffer.write(string, 4);
                    if (this.isConnected) {
                        this.socket.write(buffer);
                    }
                });
                const respond = (value) => {
                    write({ value });
                };
                const fail = (0, lodash_1.once)((error) => {
                    if (cancel) {
                        cancel();
                    }
                    write({
                        error: {
                            name: error.name,
                            message: error.message,
                            stack: error.stack,
                        },
                    });
                });
                try {
                    if (invocation == null) {
                        throw new Error('invalid dispatch');
                    }
                    this.sandbox.dispatch(messageId, invocation, {
                        fail, respond, callback, cancel,
                    });
                }
                catch (ex) {
                    fail(ex);
                }
            }
        };
        this.handleError = (error) => {
            console.error('socket error', error);
        };
        this.handleDrain = () => {
            this.socket.resume();
        };
        this.handleClose = () => {
            this.closed = true;
        };
        this.handleEnd = () => {
            this.closed = true;
        };
        this.sandbox = sandbox;
        this.worker = sandbox.worker;
        this.socket = socket;
        this.socket.on('data', this.handleData);
        this.socket.on('end', this.handleEnd);
        this.socket.on('close', this.handleClose);
        this.socket.on('error', this.handleError);
        this.socket.on('drain', this.handleDrain);
    }
    shutdown() {
        if (this.socket) {
            this.closed = true;
            this.socket.end();
            this.socket.unref();
        }
    }
    get isConnected() {
        // make sure the current sandbox worker is the worker we started with. The worker might've
        // been replaced by the time this is invoked.
        return !this.closed && this.worker === this.sandbox.worker;
    }
}
exports.default = Socket;
//# sourceMappingURL=socket.js.map