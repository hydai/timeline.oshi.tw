import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen } from "@testing-library/react";
import Header from "@/app/components/Header";

const NOW = Date.parse("2026-08-22T12:40:00Z"); // 8/22 20:40 in Taipei

describe("Header", () => {
  it("renders no wall-clock time on the server", () => {
    // The site is a static export, so anything derived from Date.now() is frozen into
    // the prerendered HTML and will not match the client. A text mismatch makes React
    // throw away the server markup and re-render the root — and the root layout owns
    // <html>, so re-rendering rewrites its className and wipes the `dark` class that
    // the no-flash script set. The visible symptom is the theme resetting to light on
    // every reload, which is nowhere near where the mismatch actually is.
    const html = renderToStaticMarkup(<Header updatedAt="" nowMs={NOW} />);

    expect(html).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("shows the clock once mounted in the browser", () => {
    render(<Header updatedAt="" nowMs={NOW} />);

    expect(screen.getByText(/20:40/)).toBeInTheDocument();
  });

  it("still names the site on the server, so the shell is not blank", () => {
    const html = renderToStaticMarkup(<Header updatedAt="" nowMs={NOW} />);

    expect(html).toContain("timeline.oshi.tw");
  });
});
