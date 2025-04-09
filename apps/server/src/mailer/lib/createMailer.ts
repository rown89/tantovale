import nodemailer from "nodemailer";

export function createMailer(process: NodeJS.Process) {
  console.log(process.env);

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}
