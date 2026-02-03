-- Migration UP Script
-- Generated at: 2026-02-03T10:14:54.253981+00:00
-- This script applies the schema changes to the target database.

BEGIN;

-- Create new tables
-- Create table 'ProjectNeighborhood'
CREATE TABLE "ProjectNeighborhood" (
    "projectId" integer NOT NULL,
    "neighborhoodId" integer NOT NULL,
    CONSTRAINT "ProjectNeighborhood_pkey" PRIMARY KEY ("projectId", "neighborhoodId")
);

-- Create table 'neighborhoods'
CREATE TABLE "neighborhoods" (
    "id" integer NOT NULL DEFAULT nextval('neighborhoods_id_seq'::regclass),
    "name" text NOT NULL,
    "districtId" integer NOT NULL,
    "created_at" timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "neighborhoods_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "neighborhoods_name_districtId_unique" UNIQUE ("name", "districtId")
);

-- Create table 'project_attachments'
CREATE TABLE "project_attachments" (
    "id" integer NOT NULL DEFAULT nextval('project_attachments_id_seq'::regclass),
    "projectId" integer NOT NULL,
    "fileName" text NOT NULL,
    "fileType" text NOT NULL,
    "fileUrl" text NOT NULL,
    "fileSize" integer,
    "uploadedAt" timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_attachments_pkey" PRIMARY KEY ("id")
);

-- Create table 'project_logs'
CREATE TABLE "project_logs" (
    "id" integer NOT NULL DEFAULT nextval('project_logs_id_seq'::regclass),
    "projectId" integer NOT NULL,
    "userId" text NOT NULL,
    "action" text NOT NULL,
    "details" text,
    "createdAt" timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changes" jsonb,
    CONSTRAINT "project_logs_pkey" PRIMARY KEY ("id")
);

-- Create table 'target_groups'
CREATE TABLE "target_groups" (
    "id" integer NOT NULL,
    "name" varchar(255) NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone NOT NULL,
    CONSTRAINT "target_groups_pkey" PRIMARY KEY ("id")
);


-- Column changes
-- Add column 'approvalStatus' to table 'Project'
ALTER TABLE "Project" ADD COLUMN "approvalStatus" ApprovalStatus NOT NULL DEFAULT 'PENDING'::"ApprovalStatus";
-- Add column 'approvedById' to table 'Project'
ALTER TABLE "Project" ADD COLUMN "approvedById" text;
-- Add column 'approvedAt' to table 'Project'
ALTER TABLE "Project" ADD COLUMN "approvedAt" timestamp without time zone;
-- Add column 'rejectionReason' to table 'Project'
ALTER TABLE "Project" ADD COLUMN "rejectionReason" text;
-- Add column 'isPublic' to table 'Project'
ALTER TABLE "Project" ADD COLUMN "isPublic" boolean NOT NULL DEFAULT false;
-- Add column 'category' to table 'Stakeholder'
ALTER TABLE "Stakeholder" ADD COLUMN "category" text;
-- Add column 'districtId' to table 'User'
ALTER TABLE "User" ADD COLUMN "districtId" integer;
-- Add column 'password' to table 'User'
ALTER TABLE "User" ADD COLUMN "password" text;
-- Add column 'mustChangePassword' to table 'User'
ALTER TABLE "User" ADD COLUMN "mustChangePassword" boolean NOT NULL DEFAULT false;

COMMIT;