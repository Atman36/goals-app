import { redirect } from "next/navigation";

// T9: login was removed (single-owner mode, no auth). This stub only exists
// so an old bookmark/link to /login still resolves somewhere useful.
export default function LoginPage() {
  redirect("/");
}
