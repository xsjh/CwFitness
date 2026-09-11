import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";
import { prisma } from "@/lib/prisma";
import { sendAccountEmail } from "@/lib/email";

const requireEmailVerification = process.env.EMAIL_VERIFICATION_REQUIRED === "true"
  || (process.env.EMAIL_VERIFICATION_REQUIRED !== "false" && process.env.NODE_ENV === "production");

const trustedOrigins = [process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3100", ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") ?? [])]
  .map((origin) => origin.trim())
  .filter(Boolean);

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification,
    resetPasswordTokenExpiresIn: Number(process.env.PASSWORD_RESET_EXPIRES_IN_SECONDS ?? 3_600),
    sendResetPassword: async ({ user, url, token }) => {
      const resetUrl = new URL(url);
      resetUrl.searchParams.set("callbackURL", "/reset-password");
      await sendAccountEmail({
        to: user.email,
        kind: "password-reset",
        subject: "Reset your CwFitness password",
        url: resetUrl.toString(),
        token,
      });
    },
  },
  ...(requireEmailVerification ? {
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: Number(process.env.EMAIL_VERIFICATION_EXPIRES_IN_SECONDS ?? 3_600),
      sendVerificationEmail: async ({ user, url, token }) => {
        const verificationUrl = new URL(url);
        verificationUrl.searchParams.set("callbackURL", "/verify-email/result");
        await sendAccountEmail({
          to: user.email,
          kind: "verification",
          subject: "Verify your CwFitness email",
          url: verificationUrl.toString(),
          token,
        });
      },
    },
  } : {}),
  trustedOrigins,
});

export async function getVerifiedSession(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true },
  });
  if (!session || (requireEmailVerification && !session.user.emailVerified)) return null;

  const requestedDeviceId = request.headers.get("x-cwfitness-device-id")?.trim();
  const deviceId = requestedDeviceId && requestedDeviceId.length >= 8 && requestedDeviceId.length <= 100
    ? requestedDeviceId
    : session.session.id;
  return { ...session, session: { ...session.session, id: deviceId } };
}
