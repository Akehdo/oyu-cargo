CREATE TYPE "PackageType" AS ENUM ('none', 'large', 'medium', 'small');

ALTER TABLE "records"
ADD COLUMN "package_type" "PackageType" NOT NULL DEFAULT 'none';
