import { saveFile } from "./files";

it("revokes the download URL only after the click has been handled", () => {
  vi.useFakeTimers();
  const revoke = vi.fn();
  vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: revoke });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  try {
    saveFile(new Blob(["x"]), "a.gmp");
    expect(click).toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith("blob:x");
  } finally {
    click.mockRestore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
