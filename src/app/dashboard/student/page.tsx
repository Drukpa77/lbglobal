import { redirect } from "next/navigation";

/** Applicant self-service dashboard is not enabled; send visitors to the public apply page. */
export default function StudentDashboardPage() {
  redirect("/apply");
}
