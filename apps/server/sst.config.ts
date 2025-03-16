/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "tantovale-backend",
      home: "aws",
      removal: input?.stage === "production" ? "retain" : "remove",
      providers: {
        aws: {
          profile:
            input.stage === "production"
              ? "tantovale-production"
              : "tantovale-dev",
        },
      },
    };
  },
  async run() {
    const vpc = new sst.aws.Vpc("MyVpc", { nat: "ec2" });
    const bucket = new sst.aws.Bucket("tantovale-images");

    const rds = new sst.aws.Postgres("MyPostgres", {
      dev: {
        username: process.env.DATABASE_USERNAME,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
        host: process.env.DATABASE_HOST,
        port: Number(process.env.DATABASE_PORT),
      },
      vpc,
    });

    const hono = new sst.aws.Function("Hono", {
      url: true,
      link: [bucket, rds],
      handler: "src/app.handler",
      environment,
    });

    return {
      api: hono.url,
    };
  },
});

const environment = {
  NODE_ENV: process.env.NODE_ENV ?? "",
  LOG_LEVEL: process.env.LOG_LEVEL ?? "",

  STOREFRONT_HOSTNAME: process.env.STOREFRONT_HOSTNAME ?? "",
  STOREFRONT_PORT: process.env.STOREFRONT_PORT ?? "",

  DATABASE_USERNAME: process.env.DATABASE_USERNAME ?? "",
  DATABASE_PASSWORD: process.env.DATABASE_PASSWORD ?? "",
  DATABASE_HOST: process.env.DATABASE_HOST ?? "",
  DATABASE_PORT: process.env.DATABASE_PORT ?? "",
  DATABASE_NAME: process.env.DATABASE_NAME ?? "",

  ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET ?? "",
  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET ?? "",
  EMAIL_VERIFY_TOKEN_SECRET: process.env.EMAIL_VERIFY_TOKEN_SECRET ?? "",
  RESET_TOKEN_SECRET: process.env.RESET_TOKEN_SECRET ?? "",
  COOKIE_SECRET: process.env.COOKIE_SECRET ?? "",

  SMTP_HOST: process.env.SMTP_HOST ?? "",
  SMTP_PORT: process.env.SMTP_PORT ?? "",
  SMTP_USER: process.env.SMTP_USER ?? "",
  SMTP_PASS: process.env.SMTP_PASS ?? "",
};
