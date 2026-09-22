import { execute } from "./engine.js?v=film-navigation-1";
self.onmessage = ({ data: { id, type, payload } }) => {
  try {
    self.postMessage({ id, result: execute(type, payload) });
  } catch (e) {
    self.postMessage({ id, error: e.message });
  }
};
