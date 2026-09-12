import { AuthExperience } from "../auth-experience";

export default async function AuthPage({ searchParams }: PageProps<"/auth">) {
  const { mode } = await searchParams;
  return <AuthExperience initialMode={mode === "sign-up" ? "sign-up" : "sign-in"} />;
}
