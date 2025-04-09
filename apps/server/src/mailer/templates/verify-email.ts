import { createMailer } from "../lib/createMailer";

export async function sendVerifyEmail(to: string, verificationLink: string) {
  const transporter = createMailer(process);

  await transporter.sendMail({
    from: `"Tantovale" <${process.env.SMTP_USER}>`,
    to,
    subject: "Attivazione account",
    html: `
      <div>
        <p>Clicca sul seguente link per attivare l'account:</p>
        <p><a href="${verificationLink}">Attiva</a></p>
      </div>
    `,
  });
}
