import '@testing-library/jest-dom';

// recharts の ResizeObserver 依存をポリフィル
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
