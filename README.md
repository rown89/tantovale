## 🚀 Overview

**Tantovale** is an open-source marketplace for buying and selling new and used items, with a special focus on collectibles and bundles.  
Built with passion and community collaboration in mind, Tantovale welcomes contributions from anyone who wants to help shape the future of online marketplaces.

- Current Phase: _INITIAL BUILDING BLOCKS_

## 🛠️ Tech Stack

### General: **[Node.js](https://nodejs.org/en)**, **[Turborepo](https://turbo.build/)**, **[TypeScript](https://www.typescriptlang.org/)**, **[Zod](https://zod.dev/)**, **[Husky](https://typicode.github.io/husky/)**.

### Frontend: **[Next.js](https://nextjs.org/)**, **[Tailwind](https://tailwindcss.com/) ([Shadcn](https://ui.shadcn.com/))**, **[Zustand](https://github.com/pmndrs/zustand)**, **[TanStack Query](https://tanstack.com/query/latest)**, **[HonoJS RPC Client](https://hono.dev/docs/guides/rpc)**

### Backend: **[HonoJS](https://hono.dev/)**, **[zod-validator](https://www.npmjs.com/package/@hono/zod-validator)**, **[hono-openapi](https://hono.dev/examples/hono-openapi)**

### Database: - **[Drizzle ORM](https://orm.drizzle.team/)** with **[PostgreSQL](https://www.postgresql.org/)**

### Installation

Tip: If you install vscode extention [restore-terminals](https://marketplace.visualstudio.com/items?itemName=EthanSK.restore-terminals) the following terminals should appear automatically:\
_storefront_, _server_, _database_, _ui_, _root_

1. **Install dependencies:**

   To install all the dependencies in _apps/\*_ and _packages/\*_ folders in the root launch:

   ```bash
   npm install
   ```

2. **Environmental variables:**\
   Each Workspace should have their .env files, currently you can find the followig _env.examples_:

   - [Storefront](https://github.com/rown89/tantovale/blob/main/apps/storefront/env.example)
   - [Server](https://github.com/rown89/tantovale/blob/main/apps/server/env.example)
   - [Database](https://github.com/rown89/tantovale/blob/main/packages/database/env.example)

3. **DB Migration:**\
   After setting up a postgres database you can launch:

   ```bash
   npm run seed-all
   ```

4. **Run storefront and server in Dev mode:**

   ```bash
   turbo dev
   ```

## ✅ Commit Standards

This repo follows the **Conventional Commits** specification to ensure consistent and meaningful commit messages.  
We use **Husky** to enforce commit message linting before changes are committed.

### Example Commit Messages:

- `feat(context): add user authentication`
- `fix(context): resolve checkout button bug`
- `docs(context): update README`
- `chore(context): setup Husky and commit linting`

For more details, refer to the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) guide.

## 💡 Why Open Source?

I believe in the power of community. Unlike many similar projects, Tantovale is built to be collaborative and inclusive—anyone can contribute new features, propose improvements, and help evolve the platform.
