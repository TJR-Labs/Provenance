import { TRPCError } from "@trpc/server";
import { forbidden, notFound } from "next/navigation";

import { Role } from "../../../../../../generated/prisma";
import { auth } from "~/server/auth";
import { getServerCaller } from "~/server/api/caller";
import { BriefForm, type BriefFormState } from "../../brief-form";
import { updateBriefAction } from "./actions";

type EditBriefPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditBriefPage({ params }: EditBriefPageProps) {
  const session = await auth();
  if (session?.user.role !== Role.COMPANY) {
    forbidden();
  }
  const companyId = session?.user.id;
  if (!companyId) forbidden();

  const { id } = await params;
  let brief;
  try {
    brief = await (await getServerCaller()).brief.getById({ id });
  } catch (error) {
    if (error instanceof TRPCError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  if (brief.companyId !== companyId) {
    forbidden();
  }

  const initialState: BriefFormState = {
    values: {
      title: brief.title,
      summary: brief.summary,
      description: brief.description,
      domain: brief.domain,
      deliverables: brief.deliverables,
    },
  };

  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-white">
        Edit brief
      </h1>
      <p className="mt-2 text-slate-400">
        Update the scope and submission requirements.
      </p>
      <BriefForm
        action={updateBriefAction.bind(null, id)}
        initialState={initialState}
        submitLabel="Save changes"
      />
    </section>
  );
}
