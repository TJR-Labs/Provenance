import { forbidden } from "next/navigation";

import { Role } from "../../../../../generated/prisma";
import { auth } from "~/server/auth";
import { BriefForm, type BriefFormState } from "../brief-form";
import { createBriefAction } from "./actions";

const initialState: BriefFormState = {
  values: {
    title: "",
    summary: "",
    description: "",
    domain: "",
    deliverables: "",
  },
};

export default async function NewBriefPage() {
  const session = await auth();
  if (session?.user.role !== Role.COMPANY) {
    forbidden();
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-white">
        Post a brief
      </h1>
      <p className="mt-2 text-slate-400">
        Scope the real-world work and define what a strong submission includes.
      </p>
      <BriefForm
        action={createBriefAction}
        initialState={initialState}
        submitLabel="Post brief"
      />
    </section>
  );
}
