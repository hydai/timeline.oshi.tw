import { beforeEach, vi } from "vitest";

// Model Next's documented native History integration. Browser checks also exercise
// the real router against the exported site, including metadata on path changes.
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (listener: () => void) => {
    window.addEventListener("test-url-change", listener);
    window.addEventListener("popstate", listener);
    return () => {
      window.removeEventListener("test-url-change", listener);
      window.removeEventListener("popstate", listener);
    };
  };
  const getLocation = () => window.location.href;
  const useLocation = () => new URL(useSyncExternalStore(subscribe, getLocation, getLocation));
  const router = {
    push: (href: string) => window.history.pushState(null, "", href),
    replace: (href: string) => window.history.replaceState(null, "", href),
  };
  return {
    usePathname: () => useLocation().pathname,
    useSearchParams: () => useLocation().searchParams,
    useRouter: () => router,
  };
});

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  for (const method of ["pushState", "replaceState"] as const) {
    const original = window.history[method].bind(window.history);
    vi.spyOn(window.history, method).mockImplementation((...args: Parameters<History[typeof method]>) => {
      original(args[0], args[1], args[2]);
      window.dispatchEvent(new Event("test-url-change"));
    });
  }
});
