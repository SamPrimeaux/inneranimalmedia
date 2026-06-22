/** Browser polyfills for Three.js GLTFExporter in Node. */
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    constructor() {
      this.result = null;
      this.onload = null;
      this.onloadend = null;
      this.onerror = null;
    }
    _finish(buf) {
      this.result = buf;
      const evt = { target: this };
      if (this.onload) this.onload(evt);
      if (this.onloadend) this.onloadend(evt);
    }
    readAsArrayBuffer(blob) {
      Promise.resolve(typeof blob.arrayBuffer === 'function' ? blob.arrayBuffer() : blob)
        .then((buf) => this._finish(buf))
        .catch((err) => {
          if (this.onerror) this.onerror(err);
        });
    }
  };
}
