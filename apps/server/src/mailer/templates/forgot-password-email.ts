import { createMailer } from "../lib/createMailer";

export async function sendForgotPasswordEmail(
  to: string,
  verificationLink: string,
) {
  const transporter = createMailer(process);

  await transporter.sendMail({
    from: `"Tantovale" <${process.env.SMTP_USER}>`,
    to,
    subject: "Password Reset",
    html: `
    <div>
      <p>Clicca sul seguente link per il reset della password:</p>
      <p><a href="${verificationLink}">Reset password</a></p>
    </div>
  `,
  });
}
