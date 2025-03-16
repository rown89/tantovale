/* This file is auto-generated by SST. Do not edit. */
/* tslint:disable */
/* eslint-disable */
/* deno-fmt-ignore-file */

declare module "sst" {
  export interface Resource {
    Hono: {
      name: string;
      type: "sst.aws.Function";
      url: string;
    };
    MyPostgres: {
      database: string;
      host: string;
      password: string;
      port: number;
      type: "sst.aws.Postgres";
      username: string;
    };
    MyVpc: {
      type: "sst.aws.Vpc";
    };
    "tantovale-images": {
      name: string;
      type: "sst.aws.Bucket";
    };
  }
}
/// <reference path="sst-env.d.ts" />

import "sst";
export {};
