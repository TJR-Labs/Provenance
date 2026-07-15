import { TRPCError } from "@trpc/server";

import {
  getUnreadMessageCount,
  InvalidOutreachBriefError,
  InvalidOutreachRecipientError,
  listInboxMessages,
  listScoutSubmissions,
  listSentMessages,
  markInboxRead,
  sendOutreach,
  sendOutreachInputSchema,
} from "~/server/messages";
import {
  companyProcedure,
  createTRPCRouter,
  engineerProcedure,
} from "~/server/api/trpc";

export const messageRouter = createTRPCRouter({
  send: companyProcedure
    .input(sendOutreachInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await sendOutreach(ctx.session.user.id, input, ctx.db);
      } catch (error) {
        if (
          error instanceof InvalidOutreachRecipientError ||
          error instanceof InvalidOutreachBriefError
        ) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw error;
      }
    }),

  scout: companyProcedure.query(({ ctx }) =>
    listScoutSubmissions(ctx.session.user.id, ctx.db),
  ),

  sent: companyProcedure.query(({ ctx }) =>
    listSentMessages(ctx.session.user.id, ctx.db),
  ),

  inbox: engineerProcedure.query(({ ctx }) =>
    listInboxMessages(ctx.session.user.id, ctx.db),
  ),

  unreadCount: engineerProcedure.query(({ ctx }) =>
    getUnreadMessageCount(ctx.session.user.id, ctx.db),
  ),

  markAllRead: engineerProcedure.mutation(({ ctx }) =>
    markInboxRead(ctx.session.user.id, ctx.db),
  ),
});
