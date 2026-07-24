import { Resend } from "resend";

import { env } from "~/env";

export type TransactionalEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type EmailSender = {
  send(message: TransactionalEmail): Promise<void>;
};

export class EmailSendFailedError extends Error {
  constructor(message = "Transactional email delivery failed.") {
    super(message);
    this.name = "EmailSendFailedError";
  }
}

function applicationOrigin() {
  const configuredOrigin =
    process.env.AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");

  return new URL(configuredOrigin).origin;
}

export function applicationUrl(path: string) {
  return new URL(path, applicationOrigin()).toString();
}

export const applicationEmailSender: EmailSender = {
  async send(message) {
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
      throw new EmailSendFailedError("Email provider is not configured.");
    }

    const result = await new Resend(env.RESEND_API_KEY).emails.send({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    if (result.error) {
      throw new EmailSendFailedError();
    }
  },
};

export async function sendPasswordResetEmail(
  email: string,
  token: string,
  sender: EmailSender = applicationEmailSender,
) {
  const resetUrl = applicationUrl(
    `/reset-password?token=${encodeURIComponent(token)}`,
  );
  await sender.send({
    to: email,
    subject: "Reset your Provenance password",
    text: `Reset your Provenance password within one hour: ${resetUrl}`,
    html: `<p>Reset your Provenance password within one hour:</p><p><a href="${resetUrl}">Reset password</a></p>`,
  });
}

export async function sendEmailVerificationEmail(
  email: string,
  token: string,
  sender: EmailSender = applicationEmailSender,
) {
  const verificationUrl = applicationUrl(
    `/verify-email?token=${encodeURIComponent(token)}`,
  );
  await sender.send({
    to: email,
    subject: "Verify your Provenance email",
    text: `Verify your Provenance email address within 24 hours: ${verificationUrl}`,
    html: `<p>Verify your Provenance email address within 24 hours:</p><p><a href="${verificationUrl}">Verify email</a></p>`,
  });
}
