import "@testing-library/jest-dom/vitest";

// jsdom implements no layout, so it ships no scrollIntoView at all. Stubbing it here
// keeps the shim in the test environment, where it belongs, rather than guarding for
// jsdom in code that only ever runs in a browser.
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {};
}
