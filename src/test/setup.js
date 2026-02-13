import "@testing-library/jest-dom/vitest";

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(String(key), String(value));
    },
    removeItem(key) {
      map.delete(String(key));
    },
    clear() {
      map.clear();
    },
  };
}

const storage = createMemoryStorage();

Object.defineProperty(globalThis, "localStorage", {
  value: storage,
  configurable: true,
});

Object.defineProperty(globalThis, "sessionStorage", {
  value: createMemoryStorage(),
  configurable: true,
});
