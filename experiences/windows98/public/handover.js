/* Uncompressed POSIX tar: one local download, no libraries or server upload. */
(() => {
  "use strict";
  function archive(entries) {
    const parts = [];
    for (const [name, data] of entries) {
      if (!/^[a-zA-Z0-9_.-]+$/.test(name) || name.length > 100) throw new Error("Invalid archive filename");
      const blob = data instanceof Blob ? data : new Blob([data]);
      if (blob.size >= 8 ** 11) throw new Error("Archive entry too large");
      const header = new Uint8Array(512);
      const put = (offset, text) => header.set(new TextEncoder().encode(text), offset);
      const octal = (offset, width, value) => put(offset, value.toString(8).padStart(width - 1, "0") + "\0");
      put(0, name);
      octal(100, 8, 0o644);
      octal(108, 8, 0);
      octal(116, 8, 0);
      octal(124, 12, blob.size);
      octal(136, 12, 0);
      put(148, "        ");
      put(156, "0");
      put(257, "ustar\0");
      put(263, "00");
      const checksum = header.reduce((sum, byte) => sum + byte, 0);
      put(148, checksum.toString(8).padStart(6, "0") + "\0 ");
      parts.push(header, blob);
      const padding = (512 - blob.size % 512) % 512;
      if (padding) parts.push(new Uint8Array(padding));
    }
    parts.push(new Uint8Array(1024));
    return new Blob(parts, { type: "application/x-tar" });
  }
  if (typeof module !== "undefined") module.exports = { archive };
  else window.Win98Handover = { archive };
})();
