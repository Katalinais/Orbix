// base.ts — app base path: "/" locally, "/repo-name/" on GitHub Pages.
// Never write absolute paths by hand; build them from BASE.
export const BASE: string = import.meta.env.BASE_URL;
