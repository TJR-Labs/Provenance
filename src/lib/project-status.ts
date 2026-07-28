import { ProjectStatus } from "../../generated/prisma";

export const projectStatusLabels: Record<ProjectStatus, string> = {
  [ProjectStatus.IDEA]: "Idea",
  [ProjectStatus.BUILDING]: "Building",
  [ProjectStatus.SHIPPED]: "Shipped",
  [ProjectStatus.ARCHIVED]: "Archived",
};

export const projectStatuses = Object.values(ProjectStatus);
