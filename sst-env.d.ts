/* This file is auto-generated by SST. Do not edit. */
/* tslint:disable */
/* eslint-disable */
/* deno-fmt-ignore-file */

declare module 'sst' {
	export interface Resource {
		Tantovale_Bucket: {
			name: string;
			type: 'sst.aws.Bucket';
		};
		Tantovale_Frontend: {
			type: 'sst.aws.Nextjs';
			url: string;
		};
		Tantovale_HonoApi: {
			name: string;
			type: 'sst.aws.Function';
			url: string;
		};
		Tantovale_Postgres: {
			database: string;
			host: string;
			password: string;
			port: number;
			type: 'sst.aws.Postgres';
			username: string;
		};
		Tantovale_Vpc: {
			bastion: string;
			type: 'sst.aws.Vpc';
		};
	}
}
/// <reference path="sst-env.d.ts" />

import 'sst';
export {};
