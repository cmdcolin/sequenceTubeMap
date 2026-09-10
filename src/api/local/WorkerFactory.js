/**
 * This file needs to be .js so Vitest can mock it properly. And it needs to be
 * imported without extension.
 */

/**
 * Make a new worker. Returns the worker object. Under Vitest this is replaced
 * with a mock that runs the worker in-process.
 */
export function makeWorker() {
  // Vite keys on this exact
  //
  // new Worker(new URL(literal string, import.meta.url), { type: 'module' })
  //
  // syntactic construction to know to actually pack up a worker JS file.
  //
  // `type: 'module'` is not optional: the dev server hands the worker over as
  // an ES module, and a classic worker parsing it dies on the first import
  // with "Cannot use import statement outside a module" — leaving in-browser
  // mode stuck on the spinner with nothing in the console but that. The build
  // bundles the worker itself, so it never noticed.
  return new Worker(new URL('./Worker.ts', import.meta.url), {
    type: 'module',
  })
}
