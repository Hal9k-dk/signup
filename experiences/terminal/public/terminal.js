// Tiny line-oriented terminal model. Deliberately not a shell or ANSI emulator.
// Output is paced as 2400 baud with 8N1 framing: 10 bits per character,
// or approximately 240 displayed characters per second.
class DumbTerminal {
  constructor({ maxLines = Infinity, baudRate = 2400, bitsPerCharacter = 10 } = {}) {
    this.lines = [''];
    this.input = '';
    this.maxLines = maxLines;
    this.characterTime = (bitsPerCharacter / baudRate) * 1000;
    this.outputQueue = [];
    this.outputChunkIndex = 0;
    this.outputCharacterIndex = 0;
    this.outputTimer = null;
    this.nextCharacterAt = null;
    this.onSubmit = () => {};
    this.onChange = () => {};
  }

  get isTransmitting() { return this.outputChunkIndex < this.outputQueue.length; }

  write(text) {
    const normalized = String(text).replace(/\r\n?/g, '\n');
    if (!normalized) return;
    this.outputQueue.push(Array.from(normalized));
    if (this.nextCharacterAt === null) {
      this.nextCharacterAt = performance.now() + this.characterTime;
    }
    this.scheduleOutput();
  }

  writeln(text = '') { this.write(`${text}\n`); }

  scheduleOutput() {
    if (this.outputTimer !== null || !this.isTransmitting) return;
    const delay = Math.max(0, this.nextCharacterAt - performance.now());
    this.outputTimer = setTimeout(() => this.transmitNext(), delay);
  }

  transmitNext() {
    this.outputTimer = null;
    if (!this.isTransmitting) {
      this.nextCharacterAt = null;
      return;
    }

    const chunk = this.outputQueue[this.outputChunkIndex];
    const character = chunk[this.outputCharacterIndex++];
    if (character === '\n') this.lines.push('');
    else this.lines[this.lines.length - 1] += character;

    if (this.outputCharacterIndex >= chunk.length) {
      this.outputChunkIndex++;
      this.outputCharacterIndex = 0;
      if (this.outputChunkIndex > 32) {
        this.outputQueue.splice(0, this.outputChunkIndex);
        this.outputChunkIndex = 0;
      }
    }

    this.trim();
    this.onChange();

    if (!this.isTransmitting) {
      this.outputQueue = [];
      this.outputChunkIndex = 0;
      this.outputCharacterIndex = 0;
      this.nextCharacterAt = null;
      return;
    }

    const now = performance.now();
    this.nextCharacterAt = Math.max(this.nextCharacterAt + this.characterTime, now + this.characterTime);
    this.scheduleOutput();
  }

  clear() {
    if (this.outputTimer !== null) clearTimeout(this.outputTimer);
    this.outputTimer = null;
    this.outputQueue = [];
    this.outputChunkIndex = 0;
    this.outputCharacterIndex = 0;
    this.nextCharacterAt = null;
    this.lines = [''];
    this.input = '';
    this.onChange();
  }

  submit({ echo = true } = {}) {
    const command = this.input;
    this.input = '';
    if (echo) this.writeln(`> ${command}`);
    this.onSubmit(command);
    this.onChange();
  }

  trim() {
    if (this.lines.length > this.maxLines) this.lines.splice(0, this.lines.length - this.maxLines);
  }
}
