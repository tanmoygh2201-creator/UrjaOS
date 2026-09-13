import { AuthForm } from "@/components/auth/auth-form";
import { signUpAction } from "@/app/actions/auth";

export const metadata = { title: "Create account" };

export default function RegisterPage() {
  return <AuthForm mode="register" action={signUpAction} />;
}
