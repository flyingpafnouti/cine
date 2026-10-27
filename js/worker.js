import { execute } from "./engine.js?v=music-selection-1";
self.onmessage = ({ data: { id, type, payload } }) => {
  try {
    self.postMessage({ id, result: execute(type, payload) });
  } catch (e) {
    self.postMessage({ id, error: e.message });
  }
};
