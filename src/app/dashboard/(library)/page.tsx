import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// The Reader is now the default view. The old library page is retired.
export default function LibraryIndex() {
  redirect("/dashboard/reader");
}
