# Project notes

- React Compiler is enabled (`babel-plugin-react-compiler` in vite.config.mjs). Manual memoization with `useMemo`, `useCallback`, or `React.memo` is usually unneeded — the compiler memoizes JSX, inline objects/arrays, and inline callbacks automatically. Reach for manual memoization only when profiling shows the compiler missed a case.
- Avoid `useEffect` when it isn't actually needed — see https://react.dev/learn/you-might-not-need-an-effect. Common bad cases: deriving state, resetting state on prop change, expensive calculations. Legit cases: synchronizing with external (non-React) systems like d3-mutated DOM.
- Package manager: pnpm. The lockfile is `pnpm-lock.yaml`; npm and yarn will not
  reproduce it.
- The frontend is built and served by Vite (`vite.config.mjs`); there is no
  webpack config. Vitest test config lives in the same file.
