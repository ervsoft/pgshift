-- Migration DOWN Script (Rollback)
-- Generated at: 2026-02-03T10:30:00.831826+00:00
-- This script reverts the schema changes.

BEGIN;

-- Revert: Add column 'mustChangePassword' to table 'User'
ALTER TABLE "User" DROP COLUMN IF EXISTS "mustChangePassword";
-- Revert: Add column 'password' to table 'User'
ALTER TABLE "User" DROP COLUMN IF EXISTS "password";
-- Revert: Add column 'districtId' to table 'User'
ALTER TABLE "User" DROP COLUMN IF EXISTS "districtId";
-- Revert: Add column 'category' to table 'Stakeholder'
ALTER TABLE "Stakeholder" DROP COLUMN IF EXISTS "category";
-- Revert: Add column 'isPublic' to table 'Project'
ALTER TABLE "Project" DROP COLUMN IF EXISTS "isPublic";
-- Revert: Add column 'rejectionReason' to table 'Project'
ALTER TABLE "Project" DROP COLUMN IF EXISTS "rejectionReason";
-- Revert: Add column 'approvedAt' to table 'Project'
ALTER TABLE "Project" DROP COLUMN IF EXISTS "approvedAt";
-- Revert: Add column 'approvedById' to table 'Project'
ALTER TABLE "Project" DROP COLUMN IF EXISTS "approvedById";
-- Revert: Add column 'approvalStatus' to table 'Project'
ALTER TABLE "Project" DROP COLUMN IF EXISTS "approvalStatus";
-- Revert: Create table 'target_groups'
DROP TABLE IF EXISTS "target_groups" CASCADE;
-- Revert: Create table 'project_logs'
DROP TABLE IF EXISTS "project_logs" CASCADE;
-- Revert: Create table 'project_attachments'
DROP TABLE IF EXISTS "project_attachments" CASCADE;
-- Revert: Create table 'neighborhoods'
DROP TABLE IF EXISTS "neighborhoods" CASCADE;
-- Revert: Create table 'ProjectNeighborhood'
DROP TABLE IF EXISTS "ProjectNeighborhood" CASCADE;

COMMIT;