import { createMailer } from "../lib/createMailer";

export async function sendForgotPasswordEmail(
  to: string,
  verificationLink: string,
) {
  const transporter = createMailer();
  await transporter.sendMail({
    from: `"Tantovale" <${process.env.SMTP_USER}>`,
    to,
    subject: "Tantovale - Password Reset",
    text: `Clicca sul seguente link per il reset della password: ${verificationLink}`,
  });
}
