import { createMailer } from "../lib/createMailer";

export async function sendVerifyEmail(to: string, verificationLink: string) {
  const transporter = createMailer();
  await transporter.sendMail({
    from: `"Tantovale" <${process.env.SMTP_USER}>`,
    to,
    subject: "Tantovale - Codice attivazione account",
    text: `Clicca sul seguente link per attivare l'account: ${verificationLink}`,
  });
}
