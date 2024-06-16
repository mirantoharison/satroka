const electron = require("electron");
const ipc = electron.ipcRenderer;
const context = electron.contextBridge;

const Size = require("../layouts/scripts/size-converter");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { default: axios } = require("axios");

context.exposeInMainWorld("ipc", {
    sendchannel: ipc.send,
    sendSyncchannel: ipc.sendSync,
    receivechannel: (channel, handler) => ipc.on(channel, handler),
    receivecancel: (channel, handler) => ipc.removeListener(channel, handler),
    receiveAllcancel: (channel) => ipc.removeAllListeners(channel),
});

context.exposeInMainWorld("cryptord", { randomBytes: (size, encoding) => { return crypto.randomBytes(size).toString(encoding) } });
context.exposeInMainWorld("fsrd", fs);
context.exposeInMainWorld("pathrd", path);
context.exposeInMainWorld("Size", { convertToOptimum: Size.convertToOptimum });
context.exposeInMainWorld("axios", axios);
