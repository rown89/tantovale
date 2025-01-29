# Tantovale monorepo

## What's inside?

This Turborepo includes the following packages/apps:

### Apps and Packages

- `web`: [Next.js](https://nextjs.org/) app
- `server`: [Hono.js]([https://nextjs.org/](https://hono.dev/)) app
- `@repo/eslint-config`: `eslint` configurations (includes `eslint-config-next` and `eslint-config-prettier`)
- `@repo/typescript-config`: `tsconfig.json`s used throughout the monorepo

Each package/app is 100% [TypeScript](https://www.typescriptlang.org/).

### Build

To build all apps and packages, run the following command:

```
cd my-turborepo
npm build
```

### Develop

To develop all apps and packages, run the following command:

```
cd my-turborepo
npm dev
```
