# Tantovale

**Tantovale** is an open-source marketplace for buying and selling new and used items, with a special focus on collectibles and bundles.  
Built with passion and community collaboration in mind, Tantovale welcomes contributions from anyone who wants to help shape the future of online marketplaces.

## 🏗️ Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (version 16 or higher)
- [Yarn](https://yarnpkg.com/) or [npm](https://www.npmjs.com/)
- [PostgreSQL](https://www.postgresql.org/)

### Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/rown89/tantovale.git
   cd tantovale
   ```

## 🚀 Overview

Tantovale is a modern, cloud-based platform that leverages cutting-edge technologies and AI to enhance user experience.  
Whether you're looking to buy or sell, our marketplace is designed to be intuitive, fast, and intelligent.

### Key Features

- **Marketplace Functionality:**  
  A dedicated platform to buy and sell new & used items, collectibles, and bundles.
- **Community-Driven:**  
  Open source from the ground up, ensuring that anyone can contribute ideas and features.
- **AI-Powered Enhancements:**  
  Artificial intelligence to improve listing experiences and SEO optimization.
- **Cloud-Native Architecture:**  
  Utilizing AWS Lambda for backend, Vercel for frontend hosting, and Amazon RDS for PostgreSQL.

## 🛠️ Tech Stack

### General

- **[Node.js](https://nodejs.org/en)**
- **Monorepo with [Turborepo](https://turbo.build/)**
- **[TypeScript](https://www.typescriptlang.org/)** & **[Zod](https://zod.dev/)** as a schema validator
- **[Husky](https://typicode.github.io/husky/)** for Git hooks with **Conventional Commits** enforcement

### Frontend

- **[Next.js](https://nextjs.org/)**
- **[Tailwind](https://tailwindcss.com/) CSS ([Shadcn](https://ui.shadcn.com/))**
- **[Zustand](https://github.com/pmndrs/zustand)** for state management
- **[TanStack Query](https://tanstack.com/query/latest)** for data fetching and caching
- **[HonoJS RPC Client](https://hono.dev/docs/guides/rpc)**

### Backend

- **[HonoJS](https://hono.dev/)** for a lightweight server framework
- **[zod-validator](https://www.npmjs.com/package/@hono/zod-validator)** & **[hono-openapi](https://hono.dev/examples/hono-openapi)** as middleware for request validation and API documentation

### Database

- **[Drizzle ORM](https://orm.drizzle.team/)** with **PostgreSQL**

## ☁️ Cloud Infrastructure

- **Backend:** Aws Lambda
- **Frontend:** Vercel
- **Database:** Amazon RDS (PostgreSQL)

## ✅ Commit Standards

This repo follows the **Conventional Commits** specification to ensure consistent and meaningful commit messages.  
We use **Husky** to enforce commit message linting before changes are committed.

### Example Commit Messages:

- `feat(context): add user authentication`
- `fix(context): resolve checkout button bug`
- `docs(context): update README`
- `chore(context): setup Husky and commit linting`

For more details, refer to the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) guide.

## 🌍 Countries + Cities + Regions + States + Subregions

[countries-states-cities-database](https://github.com/dr5hn/countries-states-cities-database)  
A zipped version updated at **27/02/2024** is placed [here](https://github.com/rown89/tantovale/tree/main/apps/server/database/scripts/seeders/countries/data).
This archive should be extracted directly in the data folder.

## 💡 Why Open Source?

I believe in the power of community. Unlike many similar projects, Tantovale is built to be collaborative and inclusive—anyone can contribute new features, propose improvements, and help evolve the platform.
