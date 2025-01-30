# Tantovale monorepo

## What's inside?

This Turborepo includes the following packages/apps:

### Apps and Packages

- `storefront`: [Next.js](https://nextjs.org/) app
- `server`: [Hono.js](<[https://nextjs.org/](https://hono.dev/)>) app
- `ui`: [Tailwind](https://tailwindcss.com/) as Css library and [Shadcn](https://ui.shadcn.com/) as collection of re-usable components
- `@repo/eslint-config`: `eslint` configurations (includes `eslint-config-next` and `eslint-config-prettier`)
- `@repo/typescript-config`: `tsconfig.json`s used throughout the monorepo

Each package/app is 100% [TypeScript](https://www.typescriptlang.org/).

### Build

To build all apps and packages, run the following command:

```
npm build
```

### Develop

To develop all apps and packages, run the following command:

```
npm dev
```
