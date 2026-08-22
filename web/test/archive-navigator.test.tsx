import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ArchiveNavigator from "@/app/components/ArchiveNavigator";
import type { ArchiveIndex } from "@/lib/types";

const index: ArchiveIndex = {
  version: "1.0.0",
  generated_at: "2026-08-22T13:00:36.141Z",
  months: [
    { month: "2026-08", streams: 266, milestones: 0 },
    { month: "2026-07", streams: 371, milestones: 2 },
    { month: "2025-12", streams: 417, milestones: 1 },
    { month: "2025-11", streams: 407, milestones: 0 },
    { month: "2024-03", streams: 354, milestones: 0 },
  ],
};

function setup(over: Partial<React.ComponentProps<typeof ArchiveNavigator>> = {}) {
  const onSelect = vi.fn();
  const onRetry = vi.fn();
  render(
    <ArchiveNavigator
      index={index}
      kind="recent"
      month="2025-12"
      onSelect={onSelect}
      onRetry={onRetry}
      loading={false}
      error={false}
      {...over}
    />,
  );
  return { onSelect, onRetry };
}

describe("ArchiveNavigator", () => {
  it("offers every year oldest-first, with the year's own total", () => {
    setup();

    const years = screen.getAllByRole("button", { name: /^\d{4} 年$/ });
    expect(years.map((button) => button.textContent)).toEqual([
      "2024354", "2025824", "2026637",
    ]);
  });

  it("marks the selected month's year as the current one", () => {
    setup();

    expect(screen.getByRole("button", { name: "2025 年" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "2026 年" })).toHaveAttribute("aria-pressed", "false");
  });

  it("shows all twelve months of the selected year with what each holds", () => {
    setup();

    expect(screen.getAllByRole("button", { name: /^2025 年 \d+ 月$/ })).toHaveLength(12);
    expect(screen.getByRole("button", { name: "2025 年 12 月" })).toHaveTextContent("417 場");
  });

  it("disables months with nothing in them instead of loading an empty rail", () => {
    setup();

    expect(screen.getByRole("button", { name: "2025 年 6 月" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "2025 年 11 月" })).toBeEnabled();
  });

  it("counts the chosen kind, so a month full of streams can still read as empty", () => {
    setup({ kind: "milestone", month: "2026-07" });

    expect(screen.getByRole("button", { name: "2026 年 8 月" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "2026 年 7 月" })).toHaveTextContent("2 筆");
  });

  it("jumps to a year's newest month when the year is picked", async () => {
    const { onSelect } = setup();

    await userEvent.click(screen.getByRole("button", { name: "2026 年" }));

    expect(onSelect).toHaveBeenCalledWith("2026-08");
  });

  it("reports the month that was picked", async () => {
    const { onSelect } = setup();

    await userEvent.click(screen.getByRole("button", { name: "2025 年 11 月" }));

    expect(onSelect).toHaveBeenCalledWith("2025-11");
  });

  it("names the month on screen so the rail is never unlabelled", () => {
    setup();

    expect(screen.getByRole("status")).toHaveTextContent("2025 年 12 月");
    expect(screen.getByRole("status")).toHaveTextContent("417 場");
  });

  it("steps to the next month with something in it, skipping the gap", async () => {
    const { onSelect } = setup();

    await userEvent.click(screen.getByRole("button", { name: "更新的月份" }));

    expect(onSelect).toHaveBeenCalledWith("2026-07");
  });

  it("steps backwards the same way", async () => {
    const { onSelect } = setup();

    await userEvent.click(screen.getByRole("button", { name: "更早的月份" }));

    expect(onSelect).toHaveBeenCalledWith("2025-11");
  });

  it("disables the step buttons at the ends of the archive", () => {
    setup({ month: "2024-03" });

    expect(screen.getByRole("button", { name: "更早的月份" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "更新的月份" })).toBeEnabled();
  });

  it("says it is loading rather than showing a silently empty month", () => {
    setup({ loading: true });

    expect(screen.getByRole("status")).toHaveTextContent("載入中");
  });

  it("offers a retry when the month failed to load", async () => {
    const { onRetry } = setup({ error: true });

    await userEvent.click(screen.getByRole("button", { name: "重新載入這個月" }));

    expect(onRetry).toHaveBeenCalled();
  });

  it("renders nothing when the archive holds none of this kind", () => {
    const { container } = render(
      <ArchiveNavigator
        index={{ ...index, months: [] }}
        kind="recent"
        month={null}
        onSelect={vi.fn()}
        onRetry={vi.fn()}
        loading={false}
        error={false}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
