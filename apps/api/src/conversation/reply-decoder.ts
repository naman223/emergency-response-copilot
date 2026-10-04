/** Extract just the top-level reply string; the complete object is validated separately. */
export class ReplyDecoder {
  private buffer = "";
  private emitted = "";
  push(chunk: string) {
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer) > 65536)
      throw Error("Response too large");
    let depth = 0,
      reply: string | undefined,
      count = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      const c = this.buffer[i];
      if (c === "{" || c === "[") depth++;
      else if (c === "}" || c === "]") depth--;
      else if (c === '"') {
        const key = this.string(i);
        if (!key.complete) break;
        let next = key.end + 1;
        while (/\s/.test(this.buffer[next] ?? "") && next < this.buffer.length)
          next++;
        if (depth === 1 && this.buffer[next] === ":" && key.value === "reply") {
          count++;
          if (count > 1) throw Error("Duplicate reply");
          next++;
          while (
            /\s/.test(this.buffer[next] ?? "") &&
            next < this.buffer.length
          )
            next++;
          if (this.buffer[next] === '"') {
            const value = this.string(next);
            reply = value.value;
            if (!value.complete) break;
            i = value.end;
            continue;
          }
        }
        i = key.end;
      }
    }
    if (reply === undefined) return "";
    if (!reply.startsWith(this.emitted)) throw Error("Reply changed");
    const delta = reply.slice(this.emitted.length);
    this.emitted = reply;
    return delta;
  }
  finish() {
    this.push("");
    const value = JSON.parse(this.buffer);
    if (typeof value.reply !== "string" || value.reply !== this.emitted)
      throw Error("Invalid reply");
    return value;
  }
  private string(start: number) {
    let value = "";
    for (let i = start + 1; i < this.buffer.length; i++) {
      const c = this.buffer[i];
      if (c === '"') return { value, complete: true, end: i };
      if (c === "\\") {
        if (i + 1 >= this.buffer.length) break;
        const escape = this.buffer[++i];
        if (escape === "u") {
          if (i + 4 >= this.buffer.length) break;
          const hex = this.buffer.slice(i + 1, i + 5);
          if (!/^[0-9a-f]{4}$/i.test(hex)) throw Error("Invalid unicode");
          value += String.fromCharCode(parseInt(hex, 16));
          i += 4;
        } else {
          const escapes: Record<string, string> = {
            '"': '"',
            "\\": "\\",
            "/": "/",
            b: "\b",
            f: "\f",
            n: "\n",
            r: "\r",
            t: "\t",
          };
          if (!(escape in escapes)) throw Error("Invalid escape");
          value += escapes[escape];
        }
      } else {
        if (c.charCodeAt(0) < 32) throw Error("Invalid string");
        value += c;
      }
    }
    // Avoid publishing half of a surrogate pair between transport chunks.
    if (/[\uD800-\uDBFF]$/.test(value)) value = value.slice(0, -1);
    return { value, complete: false, end: this.buffer.length };
  }
}
