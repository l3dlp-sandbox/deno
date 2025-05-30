// Copyright 2018-2025 the Deno authors. MIT license.
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// TODO(petamoriken): enable prefer-primordials for node polyfills
// deno-lint-ignore-file prefer-primordials
// deno-lint-ignore-file camelcase

import { op_get_env_no_permission_check } from "ext:core/ops";

import {
  clearLine,
  clearScreenDown,
  cursorTo,
  moveCursor,
} from "ext:deno_node/internal/readline/callbacks.mjs";
import { emitKeypressEvents } from "ext:deno_node/internal/readline/emitKeypressEvents.mjs";
import promises from "ext:deno_node/readline/promises.ts";
import { validateAbortSignal } from "ext:deno_node/internal/validators.mjs";
import { promisify } from "ext:deno_node/internal/util.mjs";
import { AbortError } from "ext:deno_node/internal/errors.ts";

import {
  Interface as _Interface,
  InterfaceConstructor,
  kAddHistory,
  kDecoder,
  kDeleteLeft,
  kDeleteLineLeft,
  kDeleteLineRight,
  kDeleteRight,
  kDeleteWordLeft,
  kDeleteWordRight,
  kGetDisplayPos,
  kHistoryNext,
  kHistoryPrev,
  kInsertString,
  kLine,
  kLine_buffer,
  kMoveCursor,
  kNormalWrite,
  kOldPrompt,
  kOnLine,
  kPreviousKey,
  kPrompt,
  kQuestion,
  kQuestionCallback,
  kQuestionCancel,
  kRefreshLine,
  kSawKeyPress,
  kSawReturnAt,
  kSetRawMode,
  kTabComplete,
  kTabCompleter,
  kTtyWrite,
  kWordLeft,
  kWordRight,
  kWriteToOutput,
} from "ext:deno_node/internal/readline/interface.mjs";

function Interface(input, output, completer, terminal) {
  if (!(this instanceof Interface)) {
    return new Interface(input, output, completer, terminal);
  }

  if (
    input?.input &&
    typeof input.completer === "function" && input.completer.length !== 2
  ) {
    const { completer } = input;
    input.completer = (v, cb) => cb(null, completer(v));
  } else if (typeof completer === "function" && completer.length !== 2) {
    const realCompleter = completer;
    completer = (v, cb) => cb(null, realCompleter(v));
  }

  // NOTE(bartlomieju): in Node this is `FunctionPrototypeCall(...)`,
  // but trying to do `Function.prototype.call()` somehow doesn't work here
  // /shrug
  InterfaceConstructor.bind(
    this,
  )(
    input,
    output,
    completer,
    terminal,
  );
  if (op_get_env_no_permission_check("TERM") === "dumb") {
    this._ttyWrite = _ttyWriteDumb.bind(this);
  }
}

Object.setPrototypeOf(Interface.prototype, _Interface.prototype);
Object.setPrototypeOf(Interface, _Interface);

/**
 * Displays `query` by writing it to the `output`.
 * @param {string} query
 * @param {{ signal?: AbortSignal; }} [options]
 * @param {Function} cb
 * @returns {void}
 */
Interface.prototype.question = function question(query, options, cb) {
  cb = typeof options === "function" ? options : cb;
  options = typeof options === "object" && options !== null ? options : {};

  if (options.signal) {
    validateAbortSignal(options.signal, "options.signal");
    if (options.signal.aborted) {
      return;
    }

    const onAbort = () => {
      this[kQuestionCancel]();
    };
    options.signal.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => {
      options.signal.removeEventListener(onAbort);
    };
    cb = typeof cb === "function"
      ? (answer) => {
        cleanup();
        return cb(answer);
      }
      : cleanup;
  }

  if (typeof cb === "function") {
    this[kQuestion](query, cb);
  }
};
Interface.prototype.question[promisify.custom] = function question(
  query,
  options,
) {
  options = typeof options === "object" && options !== null ? options : {};

  if (options.signal && options.signal.aborted) {
    return Promise.reject(
      new AbortError(undefined, { cause: options.signal.reason }),
    );
  }

  return new Promise((resolve, reject) => {
    let cb = resolve;

    if (options.signal) {
      const onAbort = () => {
        reject(new AbortError(undefined, { cause: options.signal.reason }));
      };
      options.signal.addEventListener("abort", onAbort, { once: true });
      cb = (answer) => {
        options.signal.removeEventListener("abort", onAbort);
        resolve(answer);
      };
    }

    this.question(query, options, cb);
  });
};

/**
 * Creates a new `readline.Interface` instance.
 * @param {Readable | {
 *   input: Readable;
 *   output: Writable;
 *   completer?: Function;
 *   terminal?: boolean;
 *   history?: string[];
 *   historySize?: number;
 *   removeHistoryDuplicates?: boolean;
 *   prompt?: string;
 *   crlfDelay?: number;
 *   escapeCodeTimeout?: number;
 *   tabSize?: number;
 *   signal?: AbortSignal;
 *   }} input
 * @param {Writable} [output]
 * @param {Function} [completer]
 * @param {boolean} [terminal]
 * @returns {Interface}
 */
function createInterface(input, output, completer, terminal) {
  return new Interface(input, output, completer, terminal);
}

Object.defineProperties(Interface.prototype, {
  // Redirect internal prototype methods to the underscore notation for backward
  // compatibility.
  [kSetRawMode]: {
    get() {
      return this._setRawMode;
    },
  },
  [kOnLine]: {
    get() {
      return this._onLine;
    },
  },
  [kWriteToOutput]: {
    get() {
      return this._writeToOutput;
    },
  },
  [kAddHistory]: {
    get() {
      return this._addHistory;
    },
  },
  [kRefreshLine]: {
    get() {
      return this._refreshLine;
    },
  },
  [kNormalWrite]: {
    get() {
      return this._normalWrite;
    },
  },
  [kInsertString]: {
    get() {
      return this._insertString;
    },
  },
  [kTabComplete]: {
    get() {
      return this._tabComplete;
    },
  },
  [kWordLeft]: {
    get() {
      return this._wordLeft;
    },
  },
  [kWordRight]: {
    get() {
      return this._wordRight;
    },
  },
  [kDeleteLeft]: {
    get() {
      return this._deleteLeft;
    },
  },
  [kDeleteRight]: {
    get() {
      return this._deleteRight;
    },
  },
  [kDeleteWordLeft]: {
    get() {
      return this._deleteWordLeft;
    },
  },
  [kDeleteWordRight]: {
    get() {
      return this._deleteWordRight;
    },
  },
  [kDeleteLineLeft]: {
    get() {
      return this._deleteLineLeft;
    },
  },
  [kDeleteLineRight]: {
    get() {
      return this._deleteLineRight;
    },
  },
  [kLine]: {
    get() {
      return this._line;
    },
  },
  [kHistoryNext]: {
    get() {
      return this._historyNext;
    },
  },
  [kHistoryPrev]: {
    get() {
      return this._historyPrev;
    },
  },
  [kGetDisplayPos]: {
    get() {
      return this._getDisplayPos;
    },
  },
  [kMoveCursor]: {
    get() {
      return this._moveCursor;
    },
  },
  [kTtyWrite]: {
    get() {
      return this._ttyWrite;
    },
  },

  // Defining proxies for the internal instance properties for backward
  // compatibility.
  _decoder: {
    get() {
      return this[kDecoder];
    },
    set(value) {
      this[kDecoder] = value;
    },
  },
  _line_buffer: {
    get() {
      return this[kLine_buffer];
    },
    set(value) {
      this[kLine_buffer] = value;
    },
  },
  _oldPrompt: {
    get() {
      return this[kOldPrompt];
    },
    set(value) {
      this[kOldPrompt] = value;
    },
  },
  _previousKey: {
    get() {
      return this[kPreviousKey];
    },
    set(value) {
      this[kPreviousKey] = value;
    },
  },
  _prompt: {
    get() {
      return this[kPrompt];
    },
    set(value) {
      this[kPrompt] = value;
    },
  },
  _questionCallback: {
    get() {
      return this[kQuestionCallback];
    },
    set(value) {
      this[kQuestionCallback] = value;
    },
  },
  _sawKeyPress: {
    get() {
      return this[kSawKeyPress];
    },
    set(value) {
      this[kSawKeyPress] = value;
    },
  },
  _sawReturnAt: {
    get() {
      return this[kSawReturnAt];
    },
    set(value) {
      this[kSawReturnAt] = value;
    },
  },
});

// Make internal methods public for backward compatibility.
Interface.prototype._setRawMode = _Interface.prototype[kSetRawMode];
Interface.prototype._onLine = _Interface.prototype[kOnLine];
Interface.prototype._writeToOutput = _Interface.prototype[kWriteToOutput];
Interface.prototype._addHistory = _Interface.prototype[kAddHistory];
Interface.prototype._refreshLine = _Interface.prototype[kRefreshLine];
Interface.prototype._normalWrite = _Interface.prototype[kNormalWrite];
Interface.prototype._insertString = _Interface.prototype[kInsertString];
Interface.prototype._tabComplete = function (lastKeypressWasTab) {
  // Overriding parent method because `this.completer` in the legacy
  // implementation takes a callback instead of being an async function.
  this.pause();
  const string = this.line.slice(0, this.cursor);
  this.completer(string, (err, value) => {
    this.resume();

    if (err) {
      // TODO(bartlomieju): inspect is not ported yet
      // this._writeToOutput(`Tab completion error: ${inspect(err)}`);
      this._writeToOutput(`Tab completion error: ${err}`);
      return;
    }

    this[kTabCompleter](lastKeypressWasTab, value);
  });
};
Interface.prototype._wordLeft = _Interface.prototype[kWordLeft];
Interface.prototype._wordRight = _Interface.prototype[kWordRight];
Interface.prototype._deleteLeft = _Interface.prototype[kDeleteLeft];
Interface.prototype._deleteRight = _Interface.prototype[kDeleteRight];
Interface.prototype._deleteWordLeft = _Interface.prototype[kDeleteWordLeft];
Interface.prototype._deleteWordRight = _Interface.prototype[kDeleteWordRight];
Interface.prototype._deleteLineLeft = _Interface.prototype[kDeleteLineLeft];
Interface.prototype._deleteLineRight = _Interface.prototype[kDeleteLineRight];
Interface.prototype._line = _Interface.prototype[kLine];
Interface.prototype._historyNext = _Interface.prototype[kHistoryNext];
Interface.prototype._historyPrev = _Interface.prototype[kHistoryPrev];
Interface.prototype._getDisplayPos = _Interface.prototype[kGetDisplayPos];
Interface.prototype._getCursorPos = _Interface.prototype.getCursorPos;
Interface.prototype._moveCursor = _Interface.prototype[kMoveCursor];
Interface.prototype._ttyWrite = _Interface.prototype[kTtyWrite];

function _ttyWriteDumb(s, key) {
  key = key || {};

  if (key.name === "escape") return;

  if (this[kSawReturnAt] && key.name !== "enter") {
    this[kSawReturnAt] = 0;
  }

  if (key.ctrl) {
    if (key.name === "c") {
      if (this.listenerCount("SIGINT") > 0) {
        this.emit("SIGINT");
      } else {
        // This readline instance is finished
        this.close();
      }

      return;
    } else if (key.name === "d") {
      this.close();
      return;
    }
  }

  switch (key.name) {
    case "return": // Carriage return, i.e. \r
      this[kSawReturnAt] = Date.now();
      this._line();
      break;

    case "enter":
      // When key interval > crlfDelay
      if (
        this[kSawReturnAt] === 0 ||
        Date.now() - this[kSawReturnAt] > this.crlfDelay
      ) {
        this._line();
      }
      this[kSawReturnAt] = 0;
      break;

    default:
      if (typeof s === "string" && s) {
        this.line += s;
        this.cursor += s.length;
        this._writeToOutput(s);
      }
  }
}

export {
  clearLine,
  clearScreenDown,
  createInterface,
  cursorTo,
  emitKeypressEvents,
  Interface,
  moveCursor,
  promises,
};
