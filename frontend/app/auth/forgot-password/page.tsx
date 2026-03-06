import { redirect } from "next/navigation";

export default function ForgotPasswordRoutePage() {
  redirect("/auth?mode=forgot");
}