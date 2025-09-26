class BufferProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.port.onmessage = (event) => {
      // Could handle start/stop, but default is active
    };
  }
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      // Flatten Float32Array for main thread
      this.port.postMessage(input[0]);
    }
    return true;
  }
}
registerProcessor('buffer-processor', BufferProcessor);