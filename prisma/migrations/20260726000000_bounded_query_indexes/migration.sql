-- Add indexes for stable (createdAt, id) cursor pagination and discovery
-- filters. B-tree indexes can be scanned backward for descending pagination.
CREATE INDEX "User_createdAt_id_idx"
ON "User"("createdAt", "id");

CREATE INDEX "Project_userId_private_createdAt_id_idx"
ON "Project"("userId", "private", "createdAt", "id");

CREATE INDEX "Project_private_createdAt_id_idx"
ON "Project"("private", "createdAt", "id");

CREATE INDEX "Project_category_private_createdAt_id_idx"
ON "Project"("category", "private", "createdAt", "id");

CREATE INDEX "Project_hashtags_idx"
ON "Project" USING GIN ("hashtags");

CREATE INDEX "ProjectMedia_projectId_order_id_idx"
ON "ProjectMedia"("projectId", "order", "id");

CREATE INDEX "Report_createdAt_id_idx"
ON "Report"("createdAt", "id");
