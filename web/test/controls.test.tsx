import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SearchBar from "@/app/components/SearchBar";
import GroupFilter from "@/app/components/GroupFilter";

describe("SearchBar", () => {
  it("calls onChange as the user types", async () => {
    const onChange = vi.fn();
    render(<SearchBar value="" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("搜尋 VTuber"), "水");
    expect(onChange).toHaveBeenCalledWith("水");
  });
});

describe("GroupFilter", () => {
  it("reflects selection and toggles on click", async () => {
    const onToggle = vi.fn();
    render(<GroupFilter groups={["子午計畫", "獨立"]} selected={["獨立"]} onToggle={onToggle} />);
    expect(screen.getByRole("button", { name: "獨立" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "子午計畫" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: "子午計畫" }));
    expect(onToggle).toHaveBeenCalledWith("子午計畫");
  });
});
