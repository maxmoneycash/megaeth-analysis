/**
 * Fixed-size circular buffer for streaming data.
 * Efficient for real-time plotting where you only need the last N points.
 */
export class RingBuffer<T> {
  private buffer: T[];
  private head = 0;
  private _size = 0;
  private capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  push(item: T) {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this._size < this.capacity) {
      this._size++;
    }
  }

  get size() {
    return this._size;
  }

  get(index: number): T | undefined {
    if (index < 0 || index >= this._size) return undefined;
    const actualIndex = (this.head - this._size + index + this.capacity) % this.capacity;
    return this.buffer[actualIndex];
  }

  *[Symbol.iterator]() {
    for (let i = 0; i < this._size; i++) {
      yield this.get(i)!;
    }
  }

  toArray(): T[] {
    return [...this];
  }

  clear() {
    this.head = 0;
    this._size = 0;
  }
}
