import { describe, it, expect } from "vitest";
import { parseYoutubeLink } from "../src/seed";

describe("parseYoutubeLink", () => {
  it("extracts a channel id", () => {
    expect(parseYoutubeLink("https://www.youtube.com/channel/UCCHsCWNTcGJ8Jml_oZ6nG2Q")).toEqual({ channelId: "UCCHsCWNTcGJ8Jml_oZ6nG2Q" });
  });
  it("extracts an @handle (percent-decoded)", () => {
    expect(parseYoutubeLink("https://www.youtube.com/@AkitsukiInori")).toEqual({ handle: "@AkitsukiInori" });
  });
  it("handles query params on channel urls", () => {
    expect(parseYoutubeLink("https://youtube.com/channel/UCoNKCsX9tSxiuh9jznYxXfw?si=abc")).toEqual({ channelId: "UCoNKCsX9tSxiuh9jznYxXfw" });
  });
  it("returns empty for legacy /c/ custom urls it cannot resolve offline", () => {
    const r = parseYoutubeLink("https://www.youtube.com/c/%E6%B5%A0MizukiChannel");
    expect(r.channelId).toBeUndefined();
  });
});
